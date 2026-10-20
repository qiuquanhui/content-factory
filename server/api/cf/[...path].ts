import { createError, defineEventHandler, getQuery, getRequestURL, readBody, setResponseStatus } from "h3"
import { randomUUID } from "node:crypto"
import { factory } from "../../services/content-factory/runtime"
import { parseWords } from "../../services/content-factory/matcher"
import { pipeline } from "../../services/content-factory/pipeline"
import { factorySources } from "../../../shared/content-factory"

export default defineEventHandler(async (event) => {
  const { store, collector } = factory()
  const path = getRequestURL(event)
    .pathname.replace(/^\/api\/cf\/?/, "")
    .split("/")
    .filter(Boolean)
  const method = event.method
  const body = () => readBody(event) as Promise<Record<string, unknown>>
  try {
    if (method === "GET" && path[0] === "dashboard") {
      const q = getQuery(event)
      const text = (key: string) => (typeof q[key] === "string" ? String(q[key]).slice(0, 200) : undefined)
      const result = store.topics({
        view: text("view"),
        source: text("source"),
        tag: text("tag"),
        query: text("q"),
        days: Math.max(1, Math.min(30, Number(q.days) || 1)),
        page: Math.max(1, Math.min(10000, Math.floor(Number(q.page) || 1))),
        sort: text("sort"),
      })
      return {
        ...result,
        tags: store.tags(),
        sources: store.sources(),
        settings: store.settings(),
        job: store.latestJob(),
        stats: store.stats(),
        capabilities: { writing: pipeline.writers.size > 0, publishing: pipeline.publishers.size > 0 },
        automationEnabled: process.env.CF_AUTOCOLLECT !== "false",
      }
    }
    if (path[0] === "refresh" && method === "POST") {
      const job = collector.start("manual")
      setResponseStatus(event, job?.status === "running" ? 202 : 200)
      return { job, message: job?.status === "running" ? "正在采集最新热点" : "刚刚已采集，请稍后刷新" }
    }
    if (path[0] === "tags") {
      if (method === "GET") return store.tags()
      if (method === "DELETE" && path[1]) {
        store.deleteTag(path[1])
        return { ok: true }
      }
      if (method === "POST" || (method === "PATCH" && path[1])) {
        const data = await body()
        const existing = path[1] ? store.tags().find((tag) => tag.id === path[1]) : null
        if (path[1] && !existing) throw createError({ statusCode: 404, message: "标签不存在" })
        if (!existing && store.tags().length >= 20) throw new Error("最多创建 20 个主题")
        const name = String(data.name ?? existing?.name ?? "").trim()
        if (!name || name.length > 30) throw new Error("主题名称需为 1–30 字")
        const keywords = parseWords(data.keywords ?? existing?.keywords ?? [])
        if (!keywords.length) throw new Error("至少填写一个命中关键词")
        const enabled = data.enabled ?? existing?.enabled ?? true
        if (typeof enabled !== "boolean") throw new Error("启用状态格式错误")
        return store.saveTag({
          id: existing?.id || randomUUID(),
          name,
          keywords,
          excludes: parseWords(data.excludes ?? existing?.excludes ?? []),
          enabled,
        })
      }
    }
    if (path[0] === "sources" && path[1] && method === "PATCH") {
      if (!factorySources.some((source) => source.id === path[1]))
        throw createError({ statusCode: 404, message: "数据源不存在" })
      const data = await body()
      if (typeof data.enabled !== "boolean") throw new Error("启用状态格式错误")
      store.enableSource(path[1], data.enabled)
      return { ok: true }
    }
    if (path[0] === "settings" && method === "PATCH") {
      const data = await body()
      const intervalMinutes = Number(data.intervalMinutes)
      if (![10, 30, 60].includes(intervalMinutes)) throw new Error("采集周期只能为 10、30 或 60 分钟")
      return store.setSettings({ ...store.settings(), intervalMinutes })
    }
    if (path[0] === "topics" && path[1]) {
      if (!store.topic(path[1])) throw createError({ statusCode: 404, message: "选题不存在" })
      if (path[2] === "favorite" && ["PUT", "DELETE"].includes(method))
        return store.favorite(path[1], method === "PUT")
      if (path[2] === "select" && ["PUT", "DELETE"].includes(method))
        return store.selectTopic(path[1], method === "PUT")
      if (path[2] === "export" && method === "GET")
        return { schemaVersion: 1, topic: store.topic(path[1]), exportedAt: new Date().toISOString() }
    }
    if (path[0] === "health" && method === "GET")
      return { status: "ok", database: "sqlite", scheduler: process.env.CF_AUTOCOLLECT !== "false" }
    throw createError({ statusCode: 404, message: "接口不存在" })
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error
    throw createError({ statusCode: 400, message: error instanceof Error ? error.message : "请求失败" })
  }
})
