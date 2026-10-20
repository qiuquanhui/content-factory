import type { InterestTag } from "../../../shared/content-factory"

export function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()
}

export function containsKeyword(text: string, keyword: string) {
  const word = normalize(keyword)
  if (!word) return false
  if (/^[\w\s.+#-]+$/.test(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text)
  }
  return text.includes(word)
}

export function matchTags(title: string, summary: string, tags: InterestTag[]) {
  const text = normalize(`${title} ${summary}`)
  return tags
    .filter((tag) => tag.enabled)
    .flatMap((tag) => {
      if (tag.excludes.some((word) => containsKeyword(text, word))) return []
      const keywords = tag.keywords.filter((word) => containsKeyword(text, word))
      return keywords.length ? [{ id: tag.id, name: tag.name, keywords }] : []
    })
}

export function parseWords(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((word) => typeof word !== "string"))
    throw new Error("关键词必须为文本列表")
  const words = [...new Set(value.map((word) => word.trim()).filter(Boolean))]
  if (words.length > 30 || words.some((word) => word.length > 60))
    throw new Error("最多 30 个关键词，每个不超过 60 字")
  return words
}
