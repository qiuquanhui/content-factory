import { XMLParser } from "fast-xml-parser"
import type { SourceID } from "../../../shared/types"
import { factorySources } from "../../../shared/content-factory"
import { sources } from "../../../shared/sources"
import { getters } from "../../getters"
import { myFetch } from "../../utils/fetch"
import type { CollectionProvider } from "./collector"
import type { CollectedItem } from "./store"
import { collectionContext } from "./request-context"

export function safeItem(item: CollectedItem): CollectedItem | null {
  if (typeof item.title !== "string" || !item.title.trim() || typeof item.url !== "string") return null
  try {
    const url = new URL(item.url)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null
    return {
      ...item,
      title: item.title.trim().slice(0, 1000),
      summary: (item.summary || "").replace(/<[^>]*>/g, " ").slice(0, 1500),
      url: url.href,
    }
  } catch {
    return null
  }
}

export const providers: CollectionProvider[] = factorySources.map((source) => ({
  id: source.id,
  minIntervalMs: source.id === "openai-rss" ? 600000 : sources[source.id as SourceID]?.interval || 600000,
  collect: (signal) =>
    collectionContext.run(signal, async () => {
      let items: CollectedItem[]
      if (source.id === "openai-rss") {
        const xml = await myFetch<string, "text">("https://openai.com/news/rss.xml", {
          responseType: "text",
          signal,
        })
        const parsed = new XMLParser().parse(xml)
        const entries = parsed?.rss?.channel?.item
        if (!entries) throw new Error("官方 RSS 返回格式异常")
        items = (Array.isArray(entries) ? entries : [entries]).map((entry: Record<string, string>) => ({
          id: typeof entry.guid === "string" ? entry.guid : entry.link,
          title: entry.title,
          summary: entry.description,
          url: entry.link,
          publishedAt: Number.isFinite(Date.parse(entry.pubDate)) ? Date.parse(entry.pubDate) : null,
        }))
      } else {
        const getter = getters[source.id as SourceID]
        if (!getter) throw new Error("尚未注册该数据源")
        const news = await getter()
        if (!Array.isArray(news)) throw new Error("数据源返回格式异常")
        items = news.map((item) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          summary: typeof item.extra?.hover === "string" ? item.extra.hover : "",
          publishedAt:
            item.pubDate && Number.isFinite(+new Date(item.pubDate)) ? +new Date(item.pubDate) : null,
        }))
      }
      const valid = items.map(safeItem).filter((item): item is CollectedItem => !!item)
      if (items.length && !valid.length) throw new Error("数据源未返回有效标题和链接")
      return valid
    }),
}))
