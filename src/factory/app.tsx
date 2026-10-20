import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Dashboard, InterestTag, Topic } from "@shared/content-factory"
import { factorySources } from "@shared/content-factory"
import { Icon } from "./icons"

async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/cf/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || result.statusMessage || "操作未完成，请重试")
  return result
}

function relative(time: number | null) {
  if (!time) return "尚未采集"
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000))
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}
const sourceFor = (id: string) => factorySources.find((source) => source.id === id)
type View = "following" | "all" | "favorites" | "selected"
type Panel = "tags" | "sources" | "settings" | "pipeline" | null

export function FactoryApp() {
  const [view, setView] = useState<View>("following")
  const [tag, setTag] = useState("")
  const [source, setSource] = useState("")
  const [days, setDays] = useState("1")
  const [sort, setSort] = useState("new")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(""), 4500)
    return () => clearTimeout(timer)
  }, [notice])
  const params = new URLSearchParams({ view, tag, source, days, sort, q: query, page: String(page) })
  const { data, isPending, isPlaceholderData, error, isFetching } = useQuery({
    queryKey: ["factory", params.toString()],
    queryFn: () => request<Dashboard>(`dashboard?${params}`),
    placeholderData: (previous) => previous,
    refetchInterval: (state) => (state.state.data?.job?.status === "running" ? 2500 : 30000),
    retry: 1,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["factory"] })
  async function action(path: string, method: string, body?: unknown, message?: string) {
    setBusy(true)
    try {
      const result = await request<{ message?: string }>(path, method, body)
      await invalidate()
      if (message || result.message) setNotice(message || result.message!)
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败")
      return false
    } finally {
      setBusy(false)
    }
  }
  function navigate(next: View) {
    setView(next)
    setTag("")
    setSource("")
    setPage(1)
  }
  const running = data?.job?.status === "running"
  const enabledSources = data?.sources.filter((item) => item.enabled) || []
  const healthy = enabledSources.filter((item) => item.status === "success").length
  const failures = enabledSources.filter((item) => item.status === "failed").length
  const title =
    view === "favorites"
      ? "把好灵感，留在手边。"
      : view === "selected"
        ? "下一个作品，从这里开始。"
        : "发现热点，找到下一个好选题。"
  const now = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(Date.now())

  return (
    <div className="factory-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="内容工厂首页">
          <span className="brand-mark">
            <Icon name="spark" size={22} />
          </span>
          <span>
            内容工厂<small>CONTENT FACTORY</small>
          </span>
        </a>
        <div className="workspace-label">
          个人工作空间 <span>LOCAL</span>
        </div>
        <nav className="primary-nav" aria-label="主导航">
          <button
            className={view === "following" || view === "all" ? "active" : ""}
            onClick={() => navigate("following")}
          >
            <Icon name="grid" />
            热点发现<span className="nav-count">{data?.stats.matched || 0}</span>
          </button>
          <button className={view === "selected" ? "active" : ""} onClick={() => navigate("selected")}>
            <Icon name="folder" />
            我的选题{data?.stats.selected ? <span className="nav-count">{data.stats.selected}</span> : null}
          </button>
          <button className={view === "favorites" ? "active" : ""} onClick={() => navigate("favorites")}>
            <Icon name="bookmark" />
            收藏夹{data?.stats.favorites ? <span className="nav-count">{data.stats.favorites}</span> : null}
          </button>
        </nav>
        <div className="sidebar-heading">
          关注主题
          <button title="管理关注主题" aria-label="管理关注主题" onClick={() => setPanel("tags")}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        <div className="interest-nav">
          {data?.tags
            .filter((item) => item.enabled)
            .map((item, index) => (
              <button
                key={item.id}
                className={tag === item.id ? "chosen" : ""}
                onClick={() => {
                  setView("following")
                  setTag(item.id)
                  setPage(1)
                }}
              >
                <span className={`topic-dot dot-${index % 4}`} />
                {item.name}
              </button>
            ))}
          <button className="add-interest" onClick={() => setPanel("tags")}>
            <Icon name="plus" size={15} />
            添加关注主题
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="workflow-card">
            <div className="workflow-symbol">
              <Icon name="activity" />
            </div>
            <b>让灵感走向作品</b>
            <p>选题 → 创作 → 发布</p>
            <button onClick={() => setPanel("pipeline")}>
              查看创作流程 <Icon name="arrow" size={15} />
            </button>
          </div>
          <button className="sidebar-setting" onClick={() => setPanel("settings")}>
            <Icon name="settings" />
            工作台设置
          </button>
          <div className="local-profile">
            <div className="avatar">我</div>
            <div>
              <b>我的创作空间</b>
              <small>
                <span className="online-dot" /> 数据保存在本地
              </small>
            </div>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">工作空间</span>
            <Icon name="chevron" size={13} />
            <span>{view === "favorites" ? "收藏夹" : view === "selected" ? "我的选题" : "热点发现"}</span>
          </div>
          <div className="topbar-right">
            <span className={`status-dot ${running ? "pulsing" : ""}`} />
            {running ? "正在采集" : data?.automationEnabled === false ? "自动采集已暂停" : "自动采集已开启"}
            <button className="icon-button" aria-label="打开设置" onClick={() => setPanel("settings")}>
              <Icon name="settings" size={19} />
            </button>
            <span className="avatar small">我</span>
          </div>
        </header>
        <div className="main-content">
          <section className="intro">
            <div>
              <div className="eyebrow">
                <span />
                你的 AI 选题工作台 <span className="intro-date">{now}</span>
              </div>
              <h1>{title}</h1>
              <p>聚合多平台动态，把值得创作的 AI 灵感收进你的选题库。</p>
            </div>
            <button
              className="primary-button refresh-button"
              disabled={running || busy}
              onClick={() => action("refresh", "POST")}
            >
              <Icon name="refresh" size={17} className={running ? "spinning" : ""} />
              {running ? "采集中…" : "刷新热点"}
            </button>
          </section>

          <section className="stats-grid" aria-label="热点概览">
            {[
              {
                label: "今日发现",
                value: data?.stats.today || 0,
                icon: "globe",
                note: "多平台实时汇集",
                color: "mint",
              },
              {
                label: "相关 AI 热点",
                value: data?.stats.matched || 0,
                icon: "spark",
                note: "近 24 小时 · 匹配关注",
                color: "violet",
              },
              {
                label: "已加入选题",
                value: data?.stats.selected || 0,
                icon: "folder",
                note: "等待你的下一个作品",
                color: "peach",
              },
              {
                label: "我的收藏",
                value: data?.stats.favorites || 0,
                icon: "bookmark",
                note: "随时回看，不错过灵感",
                color: "blue",
              },
            ].map((stat) => (
              <div className="stat" key={stat.label}>
                <div className="stat-title">
                  {stat.label}
                  <span className={`stat-icon ${stat.color}`}>
                    <Icon name={stat.icon} size={17} />
                  </span>
                </div>
                <strong>
                  {isPending ? "—" : stat.value}
                  <span>条</span>
                </strong>
                <small>{stat.note}</small>
              </div>
            ))}
          </section>

          <section className="topic-section">
            <div className="section-heading">
              <div>
                <h2>
                  {view === "favorites" ? "收藏的灵感" : view === "selected" ? "你的选题库" : "热点灵感池"}
                </h2>
                <span>
                  {view === "favorites"
                    ? "值得反复思考的内容"
                    : view === "selected"
                      ? "已选定，准备进入创作"
                      : "好内容，从发现开始"}
                </span>
              </div>
              <button className="text-button" onClick={() => setPanel("tags")}>
                <Icon name="settings" size={15} />
                管理关注
              </button>
            </div>
            <div className="feed-panel">
              <div className="feed-toolbar">
                <div className="feed-tabs" aria-label="热点范围">
                  <button
                    className={view === "following" ? "active" : ""}
                    onClick={() => navigate("following")}
                  >
                    我的关注 {view === "following" && data ? <span>{data.total}</span> : null}
                  </button>
                  <button className={view === "all" ? "active" : ""} onClick={() => navigate("all")}>
                    全部热点
                  </button>
                  {["favorites", "selected"].includes(view) && (
                    <span className="current-view">{view === "favorites" ? "已收藏" : "已选题"}</span>
                  )}
                </div>
                <label className="search-field">
                  <Icon name="search" size={16} />
                  <input
                    aria-label="搜索已采集的热点"
                    placeholder="搜索热点关键词…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <button aria-label="清除搜索" onClick={() => setSearch("")}>
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </label>
              </div>
              <div className="filter-bar">
                <div className="tag-filters">
                  <button
                    className={!tag ? "active" : ""}
                    onClick={() => {
                      setTag("")
                      setPage(1)
                    }}
                  >
                    全部主题
                  </button>
                  {data?.tags
                    .filter((item) => item.enabled)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={tag === item.id ? "active" : ""}
                        onClick={() => {
                          setTag(item.id)
                          setPage(1)
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
                <div className="select-filters">
                  <select
                    aria-label="筛选数据平台"
                    value={source}
                    onChange={(event) => {
                      setSource(event.target.value)
                      setPage(1)
                    }}
                  >
                    <option value="">全部平台</option>
                    {factorySources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {!["favorites", "selected"].includes(view) && (
                    <select
                      aria-label="筛选时间"
                      value={days}
                      onChange={(event) => {
                        setDays(event.target.value)
                        setPage(1)
                      }}
                    >
                      <option value="1">近 24 小时</option>
                      <option value="7">近 7 天</option>
                      <option value="30">近 30 天</option>
                    </select>
                  )}
                  <select
                    aria-label="排序方式"
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value)
                      setPage(1)
                    }}
                  >
                    <option value="new">最新发现</option>
                    <option value="rank">榜单排名</option>
                  </select>
                </div>
              </div>
              {error && (
                <div className="error-banner">
                  <Icon name="alert" />
                  连接工作台失败：{error.message}
                  <button onClick={() => invalidate()}>重试</button>
                </div>
              )}
              {isPending || isPlaceholderData ? (
                <div className="skeleton-list">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton-row">
                      <span />
                      <div>
                        <i />
                        <i />
                      </div>
                    </div>
                  ))}
                </div>
              ) : data?.topics.length ? (
                <div className={`topic-list ${isFetching ? "updating" : ""}`}>
                  {data.topics.map((topic, index) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      index={index + (data.page - 1) * 30}
                      stale={data.sources.find((s) => s.id === topic.sourceId)?.status === "failed"}
                      onFavorite={() =>
                        action(
                          `topics/${topic.id}/favorite`,
                          topic.favorite ? "DELETE" : "PUT",
                          undefined,
                          topic.favorite ? "已取消收藏" : "灵感已收藏",
                        )
                      }
                      onSelect={() =>
                        action(
                          `topics/${topic.id}/select`,
                          topic.stage === "selected" ? "DELETE" : "PUT",
                          undefined,
                          topic.stage === "selected" ? "已移回热点池" : "已加入我的选题",
                        )
                      }
                      onExport={() => exportTopic(topic, setNotice)}
                      busy={busy}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-illustration">
                    <Icon
                      name={running ? "refresh" : view === "favorites" ? "bookmark" : "spark"}
                      size={32}
                      className={running ? "spinning" : ""}
                    />
                  </span>
                  <h3>
                    {running
                      ? "正在为你寻找灵感"
                      : query || tag || source
                        ? "暂时没有符合条件的热点"
                        : view === "favorites"
                          ? "收藏第一个好灵感"
                          : view === "selected"
                            ? "你的下一个作品，从一个选题开始"
                            : "等待第一批 AI 热点"}
                  </h3>
                  <p>
                    {running
                      ? "正在连接数据源，结果会自动出现在这里。"
                      : view === "favorites"
                        ? "点击热点右侧的书签，就能在这里随时回看。"
                        : view === "selected"
                          ? "在热点列表中点击「加入选题」，积累你的创作素材。"
                          : "可以调整筛选、管理关键词，或刷新采集最新热点。"}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      if (view === "favorites" || view === "selected") navigate("following")
                      else if (query || tag || source) {
                        setSearch("")
                        setTag("")
                        setSource("")
                      } else action("refresh", "POST")
                    }}
                    disabled={running}
                  >
                    {view === "favorites" || view === "selected"
                      ? "去发现热点"
                      : query || tag || source
                        ? "清除筛选"
                        : "开始采集"}
                    <Icon name="arrow" size={15} />
                  </button>
                </div>
              )}
              <div className="feed-footer">
                <span>
                  <span className={`status-dot ${running ? "pulsing" : ""}`} />
                  {running
                    ? `正在更新 · 已完成 ${data?.job?.results.length || 0}/${enabledSources.length} 个源`
                    : `共 ${data?.total || 0} 条热点`}
                  <span className="footer-divider">·</span>
                  {data?.job?.finishedAt
                    ? `采集于 ${relative(data.job.finishedAt)}`
                    : "首次采集将在服务启动后自动开始"}
                </span>
                {data && data.total > 30 && (
                  <div className="pagination">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="上一页">
                      ←
                    </button>
                    <span>
                      {data.page} / {Math.ceil(data.total / 30)}
                    </span>
                    <button
                      disabled={data.page >= Math.ceil(data.total / 30)}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="下一页"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="source-strip">
            <div className="source-strip-title">
              <Icon name="globe" size={17} />
              <span>灵感来自各处</span>
            </div>
            <div className="source-logos">
              {factorySources.map((item) => {
                const state = data?.sources.find((s) => s.id === item.id)
                return (
                  <button
                    key={item.id}
                    title={`${item.name}：${state?.enabled === false ? "已暂停" : state?.status === "failed" ? state.error : state?.status === "success" ? `${state.count} 条 · ${relative(state.lastSuccessAt)}` : "等待采集"}`}
                    className={source === item.id ? "selected" : ""}
                    onClick={() => {
                      setSource(source === item.id ? "" : item.id)
                      setPage(1)
                    }}
                  >
                    <span className="mini-source" style={{ background: item.color }}>
                      {item.short}
                    </span>
                    <span>{item.name}</span>
                    <i
                      className={`source-light ${state?.enabled === false ? "paused" : state?.status || "pending"}`}
                    />
                  </button>
                )
              })}
            </div>
            <button className="text-button source-manage" onClick={() => setPanel("sources")}>
              {failures ? `${failures} 个源待重试` : `${healthy} 个源已连接`}
              <Icon name="chevron" size={14} />
            </button>
          </section>
          <footer className="workspace-footer">
            <span>把时间留给思考，让工具收集灵感。</span>
            <span>
              基于{" "}
              <a href="https://github.com/newsnext/newsnow" target="_blank" rel="noreferrer">
                NewsNow
              </a>{" "}
              构建 <span>·</span> 内容工厂 v0.1
            </span>
          </footer>
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Icon name="activity" size={17} />
          {notice}
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {panel && <SettingsPanel panel={panel} setPanel={setPanel} data={data} busy={busy} action={action} />}
    </div>
  )
}

function TopicRow({
  topic,
  index,
  stale,
  onFavorite,
  onSelect,
  onExport,
  busy,
}: {
  topic: Topic
  index: number
  stale?: boolean
  onFavorite: () => unknown
  onSelect: () => unknown
  onExport: () => unknown
  busy: boolean
}) {
  const source = sourceFor(topic.sourceId)
  return (
    <article className="topic-row">
      <span className={`row-number ${index < 3 ? "top-rank" : ""}`}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="topic-body">
        <div className="topic-title-line">
          <a className="topic-title" href={topic.url} target="_blank" rel="noopener noreferrer">
            {topic.title}
            <Icon name="external" size={14} />
          </a>
          {topic.stage !== "discovered" && (
            <span className="selected-label">
              <Icon name="check" size={11} />
              已选题
            </span>
          )}
        </div>
        {topic.summary && <p className="topic-summary">{topic.summary}</p>}
        <div className="topic-meta">
          <span className="topic-source">
            <span className="tiny-source" style={{ color: source?.color }}>
              {source?.short}
            </span>
            {source?.name || topic.sourceId}
          </span>
          <span className="meta-separator">·</span>
          <span>
            {["openai-rss", "ithome", "aihot"].includes(topic.sourceId) ? "资讯" : "榜单"} #{topic.rank}
          </span>
          <span className="meta-separator">·</span>
          <span title={new Date(topic.lastSeenAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}>
            {relative(topic.lastSeenAt)}观测
          </span>
          {stale ? (
            <span className="stale-tag">历史数据</span>
          ) : !topic.current ? (
            <span className="stale-tag neutral">已离榜</span>
          ) : null}
          {topic.tags.slice(0, 2).map((tag) => (
            <span className="match-tag" key={tag.id} title={`命中：${tag.keywords.join("、")}`}>
              {tag.name}
            </span>
          ))}
        </div>
      </div>
      <div className="topic-actions">
        <button
          className={`icon-button bookmark-button ${topic.favorite ? "saved" : ""}`}
          title={topic.favorite ? "取消收藏" : "收藏灵感"}
          aria-label={`${topic.favorite ? "取消收藏" : "收藏"}：${topic.title}`}
          aria-pressed={topic.favorite}
          onClick={onFavorite}
          disabled={busy}
        >
          <Icon name="bookmark" size={18} />
        </button>
        <button
          className={`pick-button ${topic.stage !== "discovered" ? "picked" : ""}`}
          onClick={onSelect}
          disabled={busy || !["discovered", "selected"].includes(topic.stage)}
        >
          {topic.stage === "discovered" ? (
            <>
              <Icon name="plus" size={14} />
              加入选题
            </>
          ) : (
            <>
              <Icon name="check" size={14} />
              已加入
            </>
          )}
        </button>
        {topic.stage !== "discovered" && (
          <button
            className="icon-button"
            aria-label={`导出选题：${topic.title}`}
            title="导出选题资料"
            onClick={onExport}
          >
            <Icon name="download" size={17} />
          </button>
        )}
      </div>
    </article>
  )
}

async function exportTopic(topic: Topic, notify: (message: string) => void) {
  try {
    const data = await request(`topics/${topic.id}/export`)
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `选题-${topic.id}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify("选题资料已导出，包含来源和匹配信息")
  } catch {
    notify("导出失败，请重试")
  }
}

function SettingsPanel({
  panel,
  setPanel,
  data,
  busy,
  action,
}: {
  panel: Exclude<Panel, null>
  setPanel: (panel: Panel) => void
  data?: Dashboard
  busy: boolean
  action: (path: string, method: string, body?: unknown, message?: string) => Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<InterestTag | null>(null)
  const [name, setName] = useState("")
  const [keywords, setKeywords] = useState("")
  const [excludes, setExcludes] = useState("")
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  function edit(tag: InterestTag | null) {
    setEditing(tag)
    setName(tag?.name || "")
    setKeywords(tag?.keywords.join("，") || "")
    setExcludes(tag?.excludes.join("，") || "")
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const split = (value: string) =>
      value
        .split(/[,，、\n]/)
        .map((word) => word.trim())
        .filter(Boolean)
    if (
      await action(
        editing ? `tags/${editing.id}` : "tags",
        editing ? "PATCH" : "POST",
        { name, keywords: split(keywords), excludes: split(excludes) },
        editing ? "主题已更新，历史内容已重新匹配" : "已添加关注主题",
      )
    )
      edit(null)
  }
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={() => setPanel(null)}
      onClick={(event) => {
        if (event.target === event.currentTarget) setPanel(null)
      }}
      aria-labelledby="settings-title"
    >
      <div className="dialog-surface">
        <header className="dialog-header">
          <div>
            <span className="eyebrow">属于你的创作节奏</span>
            <h2 id="settings-title">{panel === "pipeline" ? "从灵感到作品" : "工作台设置"}</h2>
          </div>
          <button className="icon-button" onClick={() => setPanel(null)} aria-label="关闭设置">
            <Icon name="close" size={22} />
          </button>
        </header>
        {panel !== "pipeline" && (
          <div className="dialog-tabs">
            {(
              [
                { id: "tags", name: "关注主题" },
                { id: "sources", name: "数据来源" },
                { id: "settings", name: "采集设置" },
              ] as const
            ).map((tab) => (
              <button
                className={panel === tab.id ? "active" : ""}
                key={tab.id}
                onClick={() => setPanel(tab.id)}
              >
                {tab.name}
              </button>
            ))}
          </div>
        )}
        <div className="dialog-content">
          {panel === "tags" && (
            <>
              <p className="panel-description">
                关键词帮你从海量动态中找到关注的内容。修改后，已有热点会立即重新匹配。
              </p>
              <div className="tag-manager">
                {data?.tags.map((tag) => (
                  <div className="managed-tag" key={tag.id}>
                    <button
                      className={`toggle ${tag.enabled ? "on" : ""}`}
                      role="switch"
                      aria-checked={tag.enabled}
                      aria-label={`启用${tag.name}`}
                      disabled={busy}
                      onClick={() => action(`tags/${tag.id}`, "PATCH", { enabled: !tag.enabled })}
                    >
                      <span />
                    </button>
                    <div>
                      <b>{tag.name}</b>
                      <small>
                        {tag.keywords.slice(0, 5).join("、")}
                        {tag.keywords.length > 5 ? "…" : ""}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      title="编辑主题"
                      aria-label={`编辑${tag.name}`}
                      onClick={() => edit(tag)}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`删除${tag.name}`}
                      title="删除主题"
                      disabled={busy}
                      onClick={() =>
                        action(`tags/${tag.id}`, "DELETE", undefined, "已删除主题，收藏内容保留")
                      }
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <form className="tag-form" onSubmit={save}>
                <h3>
                  <Icon name={editing ? "edit" : "plus"} size={17} />
                  {editing ? "编辑关注主题" : "添加关注主题"}
                  {editing && (
                    <button type="button" className="text-button" onClick={() => edit(null)}>
                      取消编辑
                    </button>
                  )}
                </h3>
                <label>
                  主题名称
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：AI 产品设计"
                    required
                    maxLength={30}
                  />
                </label>
                <label>
                  命中关键词
                  <textarea
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="AI 产品，智能体，Agent"
                    required
                    rows={3}
                  />
                  <small>用逗号分隔，命中任意一个即匹配此主题。</small>
                </label>
                <label>
                  排除词 <span>可选</span>
                  <input
                    value={excludes}
                    onChange={(e) => setExcludes(e.target.value)}
                    placeholder="培训广告，卖课"
                  />
                </label>
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? "保存中…" : editing ? "保存修改" : "添加主题"}
                  <Icon name="check" size={16} />
                </button>
              </form>
            </>
          )}
          {panel === "sources" && (
            <>
              <p className="panel-description">
                复用 NewsNow 采集器，并接入官方 RSS。单个平台异常时，其他来源继续更新，系统会自动重试。
              </p>
              <div className="source-manager">
                {factorySources.map((source) => {
                  const state = data?.sources.find((item) => item.id === source.id)
                  return (
                    <div className="managed-source" key={source.id}>
                      <span className="source-avatar" style={{ background: source.color }}>
                        {source.short}
                      </span>
                      <div>
                        <b>
                          {source.name}
                          <span>{source.kind}</span>
                        </b>
                        <small className={state?.status === "failed" ? "error-text" : ""}>
                          {state?.status === "failed"
                            ? state.error
                            : state?.status === "running"
                              ? "正在连接数据源…"
                              : state?.status === "success"
                                ? `${state.count} 条 · 最近成功 ${relative(state.lastSuccessAt)}`
                                : state?.status === "empty"
                                  ? "本轮返回空榜"
                                  : "尚未采集"}
                        </small>
                      </div>
                      <button
                        className={`toggle ${state?.enabled ? "on" : ""}`}
                        role="switch"
                        aria-checked={!!state?.enabled}
                        aria-label={`启用${source.name}`}
                        disabled={busy || !state}
                        onClick={() => action(`sources/${source.id}`, "PATCH", { enabled: !state?.enabled })}
                      >
                        <span />
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {panel === "settings" && (
            <>
              <p className="panel-description">
                服务保持运行时会自动采集，无需打开浏览器。本机休眠或关机期间不会运行。
              </p>
              <div className="setting-block">
                <Icon name="clock" size={22} />
                <div>
                  <h3>自动采集周期</h3>
                  <p>合理更新，给灵感留一点发酵时间。</p>
                </div>
              </div>
              <div className="interval-options">
                {[10, 30, 60].map((minutes) => (
                  <button
                    className={data?.settings.intervalMinutes === minutes ? "active" : ""}
                    key={minutes}
                    disabled={busy}
                    onClick={() =>
                      action("settings", "PATCH", { intervalMinutes: minutes }, "采集周期已更新")
                    }
                  >
                    {minutes}
                    <span>分钟</span>
                    {data?.settings.intervalMinutes === minutes && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
              <div className="settings-note">
                <Icon name="folder" size={19} />
                <div>
                  <b>数据属于你</b>
                  <p>热点历史保留 30 天。收藏与已选题内容会持续保留，数据存储在本地 SQLite 数据库中。</p>
                </div>
              </div>
              <div className="settings-note">
                <Icon name="link" size={19} />
                <div>
                  <b>每个选题都可以溯源</b>
                  <p>平台、原文链接与采集时间随选题保留，方便后续事实核查和内容创作。</p>
                </div>
              </div>
            </>
          )}
          {panel === "pipeline" && (
            <>
              <p className="panel-description">用一条清晰的流程，把发现、创作和发布连接起来。</p>
              <div className="pipeline-step done">
                <span>
                  <Icon name="search" size={22} />
                </span>
                <div>
                  <small>01 · 已就绪</small>
                  <h3>发现与选题</h3>
                  <p>聚合热点、关注主题、收藏灵感，并加入选题库。选题资料可导出，来源始终保留。</p>
                </div>
              </div>
              <div className="pipeline-step">
                <span>
                  <Icon name="file" size={22} />
                </span>
                <div>
                  <small>02 · 后续接入</small>
                  <h3>按你的风格创作</h3>
                  <p>接入写作模型和作者风格样本，基于选题资料生成初稿，经你审核后进入发布。</p>
                </div>
              </div>
              <div className="pipeline-step">
                <span>
                  <Icon name="send" size={22} />
                </span>
                <div>
                  <small>03 · 后续接入</small>
                  <h3>多平台发布</h3>
                  <p>通过独立平台适配器发布，分别记录发布结果，支持失败重试与避免重复发布。</p>
                </div>
              </div>
              <div className="pipeline-note">
                <Icon name="check" size={17} />
                当前已实现选题阶段，写作与发布尚未启用。
              </div>
              <button className="primary-button" onClick={() => setPanel(null)}>
                开始积累我的选题
                <Icon name="arrow" size={16} />
              </button>
            </>
          )}
        </div>
        <footer className="dialog-footer">
          <span className="online-dot" />
          设置自动保存在当前工作空间
        </footer>
      </div>
    </dialog>
  )
}
