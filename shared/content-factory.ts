/** Stable application contracts. Collection, writing and publishing share topic IDs. */
export const factorySources = [
  { id: "weibo", name: "微博", short: "微", color: "#eb5b56", kind: "热搜", domain: "weibo.com" },
  { id: "zhihu", name: "知乎", short: "知", color: "#3777eb", kind: "热榜", domain: "zhihu.com" },
  { id: "baidu", name: "百度", short: "百", color: "#526bea", kind: "热搜", domain: "baidu.com" },
  { id: "toutiao", name: "今日头条", short: "头", color: "#ed5554", kind: "热榜", domain: "toutiao.com" },
  { id: "douyin", name: "抖音", short: "抖", color: "#282d39", kind: "热榜", domain: "douyin.com" },
  {
    id: "bilibili-hot-search",
    name: "哔哩哔哩",
    short: "哔",
    color: "#e979a5",
    kind: "热搜",
    domain: "bilibili.com",
  },
  {
    id: "hackernews",
    name: "Hacker News",
    short: "Y",
    color: "#e98640",
    kind: "技术热点",
    domain: "ycombinator.com",
  },
  { id: "ithome", name: "IT之家", short: "IT", color: "#cf4343", kind: "科技资讯", domain: "ithome.com" },
  { id: "aihot", name: "AIHOT", short: "AI", color: "#8971d1", kind: "AI 资讯", domain: "aihot.news" },
  { id: "openai-rss", name: "OpenAI", short: "O", color: "#2c947d", kind: "官方动态", domain: "openai.com" },
] as const

export type FactorySourceId = (typeof factorySources)[number]["id"]
export type TopicStage = "discovered" | "selected" | "drafting" | "review" | "published"
export interface InterestTag {
  id: string
  name: string
  keywords: string[]
  excludes: string[]
  enabled: boolean
}
export interface Topic {
  id: string
  sourceId: string
  title: string
  summary: string
  url: string
  rank: number
  firstSeenAt: number
  lastSeenAt: number
  tags: { id: string; name: string; keywords: string[] }[]
  favorite: boolean
  stage: TopicStage
  current: boolean
  publishedAt: number | null
}
export interface SourceState {
  id: string
  enabled: boolean
  status: "pending" | "success" | "failed" | "empty" | "running"
  lastAttemptAt: number | null
  lastSuccessAt: number | null
  error: string | null
  count: number
  failures: number
}
export interface CollectionJob {
  id: string
  trigger: "manual" | "schedule" | "startup"
  status: "running" | "success" | "partial_failed" | "failed" | "interrupted"
  startedAt: number
  finishedAt: number | null
  results: { sourceId: string; status: string; count: number; error?: string }[]
}
export interface FactorySettings {
  intervalMinutes: number
  retentionDays: number
}
export interface Dashboard {
  topics: Topic[]
  total: number
  page: number
  tags: InterestTag[]
  sources: SourceState[]
  settings: FactorySettings
  job: CollectionJob | null
  stats: { today: number; matched: number; favorites: number; selected: number }
  capabilities: { writing: boolean; publishing: boolean }
  automationEnabled: boolean
}

export const initialTags: InterestTag[] = [
  {
    id: "ai-model",
    name: "AI 大模型",
    keywords: [
      "人工智能",
      "AI",
      "OpenAI",
      "ChatGPT",
      "DeepSeek",
      "Claude",
      "Gemini",
      "大模型",
      "LLM",
      "GPT",
      "通义",
      "千问",
      "Qwen",
      "智谱",
      "Kimi",
      "豆包",
    ],
    excludes: ["卖课", "培训广告"],
    enabled: true,
  },
  {
    id: "ai-tools",
    name: "AI 工具",
    keywords: [
      "AI 工具",
      "智能体",
      "Agent",
      "AI agent",
      "Cursor",
      "Codex",
      "Copilot",
      "MCP",
      "AI 编程",
      "Vibe coding",
      "自动化",
      "RAG",
    ],
    excludes: [],
    enabled: true,
  },
  {
    id: "ai-business",
    name: "AI 商业",
    keywords: [
      "AI 创业",
      "AI 融资",
      "人工智能融资",
      "算力",
      "英伟达",
      "NVIDIA",
      "AI 应用",
      "AI 商业",
      "AI startup",
    ],
    excludes: [],
    enabled: true,
  },
  {
    id: "ai-creative",
    name: "AI 创作",
    keywords: [
      "AI 写作",
      "AI 视频",
      "AI 绘画",
      "文生图",
      "文生视频",
      "Sora",
      "Midjourney",
      "可灵",
      "即梦",
      "图像生成",
    ],
    excludes: [],
    enabled: true,
  },
]
