import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { FactoryStore } from "../server/services/content-factory/store"
import { matchTags } from "../server/services/content-factory/matcher"
import { Collector } from "../server/services/content-factory/collector"
import { PipelineRegistry } from "../server/services/content-factory/pipeline"
import type { InterestTag } from "../shared/content-factory"
import { factorySources } from "../shared/content-factory"

const tag: InterestTag = {
  id: "test-ai",
  name: "AI",
  keywords: ["AI", "OpenAI", "人工智能"],
  excludes: ["卖课"],
  enabled: true,
}
const stores: FactoryStore[] = []
function database() {
  const store = new FactoryStore(":memory:")
  stores.push(store)
  return store
}
const item = { id: "abc", title: "OpenAI 发布新模型", url: "https://example.com/story", summary: "" }
afterEach(() => {
  stores.splice(0).forEach((store) => store.close())
})

describe("可解释主题匹配", () => {
  it("英文边界避免 AI 误命中 chair，支持 NFKC 与中文相邻", () => {
    expect(matchTags("chair fair rain", "", [tag])).toEqual([])
    expect(matchTags("ＡＩ工具发布", "", [tag])[0].keywords).toEqual(["AI"])
    expect(matchTags("人工智能模型", "", [tag])[0].id).toBe("test-ai")
  })
  it("排除词只影响当前标签，允许多标签，并使用摘要", () => {
    const other = { ...tag, id: "other", excludes: [] }
    expect(matchTags("OpenAI 卖课", "", [tag, other]).map((match) => match.id)).toEqual(["other"])
    expect(matchTags("新品发布", "基于 OpenAI 模型", [tag])).toHaveLength(1)
    expect(matchTags("AI", "", [{ ...tag, enabled: false }])).toEqual([])
  })
})

describe("持久化仓储行为", () => {
  it("同源重复采集幂等，保持收藏和选题，跨源条目独立", () => {
    const store = database()
    store.ingest("zhihu", [item, item], "job-1")
    const first = store.topics().topics[0]
    store.favorite(first.id, true)
    store.selectTopic(first.id, true)
    store.ingest("zhihu", [{ ...item, title: "OpenAI 更新模型" }], "job-1")
    expect(store.topics({ view: "all" }).total).toBe(1)
    expect(store.topic(first.id)).toMatchObject({
      favorite: true,
      stage: "selected",
      title: "OpenAI 更新模型",
    })
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM cf_snapshots").get()).toMatchObject({ n: 1 })
    store.ingest("weibo", [item], "job-2")
    expect(store.topics({ view: "all" }).total).toBe(2)
  })
  it("修改标签重算已有内容，删除标签不删除收藏", () => {
    const store = database()
    store.ingest("zhihu", [{ ...item, title: "月球探测任务" }], "job")
    const first = store.topics({ view: "all" }).topics[0]
    expect(store.topics().total).toBe(0)
    store.saveTag({ ...tag, id: "space", name: "航天", keywords: ["月球"] })
    expect(store.topics().topics[0].tags[0].name).toBe("航天")
    store.favorite(first.id, true)
    store.deleteTag("space")
    expect(store.topics().total).toBe(0)
    expect(store.topics({ view: "favorites" }).total).toBe(1)
  })
  it("空榜清除当前在榜标记，但保留最后非空成功时间", () => {
    const store = database()
    store.ingest("zhihu", [item], "first", 1000)
    store.ingest("zhihu", [], "empty", 2000)
    expect(store.sources().find((source) => source.id === "zhihu")).toMatchObject({
      status: "empty",
      lastSuccessAt: 1000,
    })
    expect(store.db.prepare("SELECT current FROM cf_items").get()).toMatchObject({ current: 0 })
  })
  it("清理历史保留收藏与已选题，未收藏普通条目按期清理", () => {
    const store = database()
    store.ingest("zhihu", [item, { ...item, id: "second" }, { ...item, id: "third" }], "job", 1)
    const rows = store.db.prepare("SELECT id FROM cf_items ORDER BY rank").all() as { id: string }[]
    store.favorite(rows[0].id, true)
    store.selectTopic(rows[1].id, true)
    store.cleanup(40 * 86400000)
    expect(store.topic(rows[0].id)?.favorite).toBe(true)
    expect(store.topic(rows[1].id)?.stage).toBe("selected")
    expect(store.topic(rows[2].id)).toBeNull()
  })
  it("事务失败回滚并保留上海日期统计", () => {
    const store = database()
    expect(() =>
      store.transaction(() => {
        store.enableSource("zhihu", false)
        throw new Error("test")
      }),
    ).toThrow()
    expect(store.sources().find((source) => source.id === "zhihu")?.enabled).toBe(true)
    expect(store.stats()).toEqual({ today: 0, matched: 0, favorites: 0, selected: 0 })
  })
  it("真实数据库关闭重开后保留主题、收藏、选题与调度设置", () => {
    const directory = mkdtempSync(join(tmpdir(), "content-factory-test-"))
    const filename = join(directory, "persist.sqlite")
    let store: FactoryStore | undefined
    try {
      store = new FactoryStore(filename)
      store.ingest("zhihu", [item], "persist-job")
      const topic = store.topics().topics[0]
      store.favorite(topic.id, true)
      store.selectTopic(topic.id, true)
      store.setSettings({ intervalMinutes: 30, retentionDays: 30 })
      store.close()
      store = new FactoryStore(filename)
      expect(store.topic(topic.id)).toMatchObject({ favorite: true, stage: "selected" })
      expect(store.settings().intervalMinutes).toBe(30)
      expect(store.tags()).toHaveLength(4)
    } finally {
      store?.close()
      for (const path of [filename, `${filename}-wal`, `${filename}-shm`])
        if (existsSync(path)) unlinkSync(path)
      rmdirSync(directory)
    }
  })
  it("故障保留最后成功数据与时间，不把失败当成新鲜采集", () => {
    const store = database()
    store.ingest("zhihu", [item], "good", Date.now())
    const topic = store.topics().topics[0]
    const lastSuccessAt = store.sources().find((source) => source.id === "zhihu")?.lastSuccessAt
    store.startSource("zhihu", Date.now() + 1000)
    store.failSource("zhihu", "timeout")
    expect(store.sources().find((source) => source.id === "zhihu")).toMatchObject({
      lastSuccessAt,
      status: "failed",
    })
    expect(store.topic(topic.id)?.lastSeenAt).toBe(topic.lastSeenAt)
  })
  it("恢复进程中断时关闭旧任务，不重置收藏状态", () => {
    const store = database()
    store.saveJob({
      id: "interrupted",
      trigger: "manual",
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      results: [],
    })
    store.startSource("weibo", Date.now())
    store.recover()
    expect(store.latestJob()?.status).toBe("interrupted")
    expect(store.sources().find((source) => source.id === "weibo")?.status).toBe("failed")
    expect(store.sources().find((source) => source.id === "weibo")?.lastAttemptAt).toBeNull()
  })
})

describe("采集任务边界", () => {
  it("部分源故障隔离，重复刷新共享同一任务，冷却不重复请求", async () => {
    const store = database()
    let calls = 0
    const collector = new Collector(store, [
      {
        id: "zhihu",
        collect: async () => {
          calls++
          await Promise.resolve()
          return [item]
        },
      },
      {
        id: "weibo",
        collect: async () => {
          throw new Error("HTTP 403")
        },
      },
    ])
    const first = collector.start()
    expect(collector.start()?.id).toBe(first?.id)
    await collector.wait()
    expect(store.latestJob()?.status).toBe("partial_failed")
    expect(store.sources().find((source) => source.id === "weibo")).toMatchObject({ status: "failed" })
    expect(store.topics().total).toBe(1)
    collector.start()
    await collector.wait()
    expect(calls).toBe(1)
  })
  it("真正取消超时请求，所有源失败时任务失败", async () => {
    const store = database()
    let cancelled = false
    const collector = new Collector(
      store,
      [
        {
          id: "zhihu",
          collect: (signal) =>
            new Promise((_, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  cancelled = true
                  reject(signal.reason)
                },
                { once: true },
              )
            }),
        },
      ],
      15,
    )
    collector.start()
    await collector.wait()
    expect(cancelled).toBe(true)
    expect(store.latestJob()?.status).toBe("failed")
  })
  it("尊重关闭的源和自动周期，不因浏览页面执行采集", async () => {
    const store = database()
    for (const source of factorySources) store.enableSource(source.id, source.id === "zhihu")
    let calls = 0
    const collector = new Collector(store, [
      {
        id: "zhihu",
        collect: async () => {
          calls++
          return [item]
        },
      },
    ])
    collector.start("schedule")
    await collector.wait()
    collector.start("schedule")
    await collector.wait()
    expect(calls).toBe(1)
    store.enableSource("zhihu", false)
    collector.start("schedule", Date.now() + 700000)
    await collector.wait()
    expect(calls).toBe(1)
  })
  it("手动刷新尊重适配器声明的最小间隔", async () => {
    const store = database()
    let calls = 0
    const collector = new Collector(store, [
      {
        id: "zhihu",
        minIntervalMs: 3600000,
        collect: async () => {
          calls++
          return [item]
        },
      },
    ])
    collector.start("manual")
    await collector.wait()
    collector.start("manual", Date.now() + 1800000)
    await collector.wait()
    expect(calls).toBe(1)
    collector.start("manual", Date.now() + 3600001)
    await collector.wait()
    expect(calls).toBe(2)
  })
})

it("未来适配器可注册且不允许重复覆盖", () => {
  const pipeline = new PipelineRegistry()
  const writer = { id: "test", generate: async () => ({ title: "title", markdown: "draft", citations: [] }) }
  pipeline.registerWriter(writer)
  expect(() => pipeline.registerWriter(writer)).toThrow("重复写作适配器")
  expect(pipeline.writers.get("test")).toBe(writer)
})
