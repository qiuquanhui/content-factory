import { randomUUID } from "node:crypto"
import type { CollectionJob } from "../../../shared/content-factory"
import type { CollectedItem, FactoryStore } from "./store"

export interface CollectionProvider {
  id: string
  minIntervalMs?: number
  collect: (signal: AbortSignal) => Promise<CollectedItem[]>
}

/** Scheduling depends only on this interface, never on an individual platform. */
export class Collector {
  private active: CollectionJob | null = null
  private completion: Promise<void> = Promise.resolve()
  private closed = false
  private controllers = new Set<AbortController>()
  constructor(
    private store: FactoryStore,
    private providers: CollectionProvider[],
    private budgetMs = 60000,
  ) {}

  start(trigger: CollectionJob["trigger"] = "manual", now = Date.now()) {
    if (this.active) return this.active
    const interval = this.store.settings().intervalMinutes * 60000
    const due = this.store.sources().filter((source) => {
      if (!source.enabled || !this.providers.some((provider) => provider.id === source.id)) return false
      // Manual refresh cannot bypass the upstream source's minimum interval.
      const sourceMinimum =
        this.providers.find((provider) => provider.id === source.id)?.minIntervalMs ?? 600000
      const minimum = trigger === "manual" ? sourceMinimum : Math.max(interval, sourceMinimum)
      const wait = source.failures >= 3 ? Math.max(minimum, 30 * 60000) : minimum
      return !source.lastAttemptAt || now - source.lastAttemptAt >= wait
    })
    if (!due.length) return this.store.latestJob()
    const job: CollectionJob = {
      id: randomUUID(),
      trigger,
      status: "running",
      startedAt: now,
      finishedAt: null,
      results: [],
    }
    this.active = job
    this.store.saveJob(job)
    this.completion = this.run(
      job,
      due.map((source) => source.id),
    )
      .catch((error) => {
        job.status = "failed"
        job.finishedAt = Date.now()
        this.store.saveJob(job)
        console.error(
          "[content-factory] collection job failed",
          error instanceof Error ? error.message : "unknown error",
        )
      })
      .finally(() => {
        this.active = null
      })
    return job
  }

  private async run(job: CollectionJob, ids: string[]) {
    const queue = [...ids]
    const worker = async () => {
      while (queue.length && !this.closed) {
        const id = queue.shift()!
        const provider = this.providers.find((provider) => provider.id === id)!
        const controller = new AbortController()
        this.controllers.add(controller)
        const timer = setTimeout(() => controller.abort(new Error("采集超时，请稍后重试")), this.budgetMs)
        this.store.startSource(id, Date.now())
        try {
          const items = await provider.collect(controller.signal)
          if (controller.signal.aborted) throw controller.signal.reason
          if (!Array.isArray(items)) throw new Error("数据源返回格式异常")
          this.store.ingest(id, items, job.id)
          job.results.push({
            sourceId: id,
            status: items.length ? "success" : "empty",
            count: Math.min(items.length, 30),
          })
        } catch (error) {
          const raw = error instanceof Error ? error.message : "未知错误"
          const message = /403|401|blocked/i.test(raw)
            ? "平台暂时限制访问，系统会自动重试"
            : /timeout|abort|超时/i.test(raw)
              ? "请求超时，已保留上次数据"
              : raw.slice(0, 180)
          if (this.closed) this.store.interruptSource(id)
          else this.store.failSource(id, message)
          job.results.push({ sourceId: id, status: "failed", count: 0, error: message })
        } finally {
          clearTimeout(timer)
          this.controllers.delete(controller)
          this.store.saveJob(job)
        }
      }
    }
    await Promise.all([worker(), worker()])
    const failed = job.results.filter((result) => result.status === "failed").length
    job.status = this.closed
      ? "interrupted"
      : failed === ids.length
        ? "failed"
        : failed
          ? "partial_failed"
          : "success"
    job.finishedAt = Date.now()
    this.store.saveJob(job)
    this.store.event("collection.completed", null, { jobId: job.id, status: job.status })
    this.store.cleanup()
  }
  wait() {
    return this.completion
  }
  async close() {
    this.closed = true
    for (const controller of this.controllers) controller.abort(new Error("服务正在停止"))
    await this.completion
  }
}
