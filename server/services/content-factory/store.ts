import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import type {
  CollectionJob,
  FactorySettings,
  InterestTag,
  SourceState,
  Topic,
  TopicStage,
} from "../../../shared/content-factory"
import { factorySources, initialTags } from "../../../shared/content-factory"
import { matchTags } from "./matcher"

interface ItemRow {
  id: string
  source_id: string
  title: string
  summary: string
  url: string
  rank: number
  first_seen: number
  last_seen: number
  matches: string
  favorite: number
  stage: TopicStage
  current: number
  published_at: number | null
}
interface SourceRow {
  id: string
  enabled: number
  status: SourceState["status"]
  last_attempt: number | null
  last_success: number | null
  error: string | null
  count: number
  failures: number
}
export interface CollectedItem {
  id?: string | number
  title: string
  summary?: string
  url: string
  publishedAt?: number | null
}

/** One persistent repository; provider implementations never own product state. */
export class FactoryStore {
  readonly db: DatabaseSync
  constructor(filename = process.env.CF_DATABASE_PATH || resolve(".data/content-factory.sqlite")) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true })
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS cf_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cf_tags (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cf_sources (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending', last_attempt INTEGER, last_success INTEGER,
        error TEXT, count INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS cf_items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, item_key TEXT NOT NULL,
        title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, rank INTEGER NOT NULL,
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, matches TEXT NOT NULL DEFAULT '[]',
        favorite INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'discovered', current INTEGER NOT NULL DEFAULT 1,
        published_at INTEGER, UNIQUE(source_id,item_key));
      CREATE INDEX IF NOT EXISTS cf_items_seen ON cf_items(last_seen DESC);
      CREATE INDEX IF NOT EXISTS cf_items_source ON cf_items(source_id,last_seen DESC);
      CREATE TABLE IF NOT EXISTS cf_jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL, started_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cf_snapshots (id TEXT PRIMARY KEY, job_id TEXT NOT NULL,
        source_id TEXT NOT NULL, collected_at INTEGER NOT NULL, items TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cf_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, topic_id TEXT,
        payload TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS cf_events_created ON cf_events(created_at);
    `)
    if (!this.db.prepare("SELECT 1 FROM cf_meta WHERE key='schema'").get()) {
      this.transaction(() => {
        for (const tag of initialTags)
          this.db.prepare("INSERT OR IGNORE INTO cf_tags VALUES (?,?)").run(tag.id, JSON.stringify(tag))
        this.setSettings({ intervalMinutes: 10, retentionDays: 30 })
        this.db.prepare("INSERT INTO cf_meta VALUES ('schema','1')").run()
      })
    }
    for (const source of factorySources)
      this.db.prepare("INSERT OR IGNORE INTO cf_sources(id) VALUES (?)").run(source.id)
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const result = work()
      this.db.exec("COMMIT")
      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  tags(): InterestTag[] {
    return (this.db.prepare("SELECT value FROM cf_tags ORDER BY rowid").all() as { value: string }[]).map(
      (row) => JSON.parse(row.value),
    )
  }

  saveTag(tag: InterestTag) {
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO cf_tags VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value")
        .run(tag.id, JSON.stringify(tag))
      this.rematch()
    })
    return tag
  }

  deleteTag(id: string) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM cf_tags WHERE id=?").run(id)
      this.rematch()
    })
  }

  rematch() {
    const tags = this.tags()
    for (const item of this.db.prepare("SELECT id,title,summary FROM cf_items").all() as Pick<
      ItemRow,
      "id" | "title" | "summary"
    >[])
      this.db
        .prepare("UPDATE cf_items SET matches=? WHERE id=?")
        .run(JSON.stringify(matchTags(item.title, item.summary, tags)), item.id)
  }

  settings(): FactorySettings {
    const row = this.db.prepare("SELECT value FROM cf_meta WHERE key='settings'").get() as { value: string }
    return JSON.parse(row.value)
  }

  setSettings(settings: FactorySettings) {
    this.db
      .prepare(
        "INSERT INTO cf_meta VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(settings))
    return settings
  }

  sources(): SourceState[] {
    return (this.db.prepare("SELECT * FROM cf_sources ORDER BY rowid").all() as unknown as SourceRow[]).map(
      (row) => ({
        id: row.id,
        enabled: !!row.enabled,
        status: row.status,
        lastAttemptAt: row.last_attempt,
        lastSuccessAt: row.last_success,
        error: row.error,
        count: row.count,
        failures: row.failures,
      }),
    )
  }

  enableSource(id: string, enabled: boolean) {
    this.db.prepare("UPDATE cf_sources SET enabled=? WHERE id=?").run(Number(enabled), id)
  }

  startSource(id: string, now: number) {
    this.db.prepare("UPDATE cf_sources SET status='running',last_attempt=? WHERE id=?").run(now, id)
  }

  failSource(id: string, error: string) {
    this.db
      .prepare("UPDATE cf_sources SET status='failed',error=?,failures=failures+1 WHERE id=?")
      .run(error.slice(0, 300), id)
  }

  interruptSource(id: string) {
    this.db
      .prepare(
        "UPDATE cf_sources SET status='failed',last_attempt=NULL,error='上次采集被中断，将自动重试' WHERE id=?",
      )
      .run(id)
  }

  ingest(sourceId: string, items: CollectedItem[], jobId: string, now = Date.now()) {
    const tags = this.tags()
    this.transaction(() => {
      this.db.prepare("UPDATE cf_items SET current=0 WHERE source_id=?").run(sourceId)
      const ids: { id: string; rank: number }[] = []
      const seen = new Set<string>()
      items.slice(0, 30).forEach((item, index) => {
        const key = String(item.id ?? item.url)
        if (seen.has(key)) return
        seen.add(key)
        const id = createHash("sha256").update(`${sourceId}:${key}`).digest("hex").slice(0, 24)
        this.db
          .prepare(
            `INSERT INTO cf_items(id,source_id,item_key,title,summary,url,rank,first_seen,last_seen,matches,published_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,item_key) DO UPDATE SET title=excluded.title,
          summary=excluded.summary,url=excluded.url,rank=excluded.rank,last_seen=excluded.last_seen,
          matches=excluded.matches,current=1,published_at=COALESCE(excluded.published_at,cf_items.published_at)`,
          )
          .run(
            id,
            sourceId,
            key,
            item.title,
            item.summary || "",
            item.url,
            index + 1,
            now,
            now,
            JSON.stringify(matchTags(item.title, item.summary || "", tags)),
            item.publishedAt ?? null,
          )
        ids.push({ id, rank: index + 1 })
      })
      this.db
        .prepare("INSERT OR IGNORE INTO cf_snapshots VALUES (?,?,?,?,?)")
        .run(`${jobId}:${sourceId}`, jobId, sourceId, now, JSON.stringify(ids))
      this.db
        .prepare(
          `UPDATE cf_sources SET status=?,last_attempt=?,last_success=CASE WHEN ?>0 THEN ? ELSE last_success END,
        count=?,error=NULL,failures=0 WHERE id=?`,
        )
        .run(ids.length ? "success" : "empty", now, ids.length, now, ids.length, sourceId)
    })
  }

  topics(
    options: {
      view?: string
      source?: string
      tag?: string
      query?: string
      days?: number
      page?: number
      sort?: string
    } = {},
  ) {
    const where = ["1=1"]
    const params: (string | number)[] = []
    if (options.view === "favorites") where.push("favorite=1")
    else if (options.view === "selected") where.push("stage!='discovered'")
    else if (options.view !== "all") where.push("matches!='[]'")
    if (options.source) {
      where.push("source_id=?")
      params.push(options.source)
    }
    if (options.tag) {
      where.push("EXISTS(SELECT 1 FROM json_each(cf_items.matches) WHERE json_extract(value,'$.id')=?)")
      params.push(options.tag)
    }
    if (options.query) {
      where.push("(instr(lower(title),lower(?))>0 OR instr(lower(summary),lower(?))>0)")
      params.push(options.query, options.query)
    }
    if (options.view !== "favorites" && options.view !== "selected") {
      where.push("last_seen>=?")
      params.push(Date.now() - (options.days || 1) * 86400000)
    }
    const filter = where.join(" AND ")
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM cf_items WHERE ${filter}`).get(...params) as { n: number }
    ).n
    const page = Math.max(1, Math.min(options.page || 1, Math.max(1, Math.ceil(total / 30))))
    // Interleave sources collected in the same ten-minute discovery window.
    const order =
      options.sort === "rank"
        ? "current DESC,rank ASC,last_seen DESC,id"
        : "(first_seen/600000) DESC,rank ASC,first_seen DESC,id"
    const rows = this.db
      .prepare(`SELECT * FROM cf_items WHERE ${filter} ORDER BY ${order} LIMIT 30 OFFSET ?`)
      .all(...params, (page - 1) * 30) as unknown as ItemRow[]
    return { topics: rows.map((row) => this.toTopic(row)), total, page }
  }

  topic(id: string) {
    const row = this.db.prepare("SELECT * FROM cf_items WHERE id=?").get(id) as unknown as ItemRow | undefined
    return row ? this.toTopic(row) : null
  }

  private toTopic(row: ItemRow): Topic {
    return {
      id: row.id,
      sourceId: row.source_id,
      title: row.title,
      summary: row.summary,
      url: row.url,
      rank: row.rank,
      firstSeenAt: row.first_seen,
      lastSeenAt: row.last_seen,
      tags: JSON.parse(row.matches),
      favorite: !!row.favorite,
      stage: row.stage,
      current: !!row.current,
      publishedAt: row.published_at,
    }
  }

  favorite(id: string, favorite: boolean) {
    this.db.prepare("UPDATE cf_items SET favorite=? WHERE id=?").run(Number(favorite), id)
    return this.topic(id)
  }

  selectTopic(id: string, selected: boolean) {
    const topic = this.topic(id)
    if (!topic) return null
    if (!["discovered", "selected"].includes(topic.stage)) throw new Error("进行中的选题不能直接移回热点池")
    this.transaction(() => {
      this.db.prepare("UPDATE cf_items SET stage=? WHERE id=?").run(selected ? "selected" : "discovered", id)
      this.event(selected ? "topic.selected" : "topic.deselected", id, { title: topic.title, url: topic.url })
    })
    return this.topic(id)
  }

  event(type: string, topicId: string | null, payload: unknown) {
    this.db
      .prepare("INSERT INTO cf_events VALUES (?,?,?,?,?)")
      .run(randomUUID(), type, topicId, JSON.stringify(payload), Date.now())
  }

  stats() {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(Date.now())
    const midnight = Date.parse(`${date}T00:00:00+08:00`)
    const count = (filter: string, ...params: number[]) =>
      (this.db.prepare(`SELECT COUNT(*) AS n FROM cf_items WHERE ${filter}`).get(...params) as { n: number })
        .n
    return {
      today: count("first_seen>=?", midnight),
      matched: count("matches!='[]' AND last_seen>=?", Date.now() - 86400000),
      favorites: count("favorite=1"),
      selected: count("stage!='discovered'"),
    }
  }

  saveJob(job: CollectionJob) {
    this.db
      .prepare("INSERT INTO cf_jobs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value")
      .run(job.id, JSON.stringify(job), job.startedAt)
  }

  latestJob(): CollectionJob | null {
    const row = this.db.prepare("SELECT value FROM cf_jobs ORDER BY started_at DESC LIMIT 1").get() as
      | { value: string }
      | undefined
    return row ? JSON.parse(row.value) : null
  }

  recover() {
    for (const row of this.db.prepare("SELECT id,value FROM cf_jobs").all() as {
      id: string
      value: string
    }[]) {
      const job: CollectionJob = JSON.parse(row.value)
      if (job.status === "running") this.saveJob({ ...job, status: "interrupted", finishedAt: Date.now() })
    }
    this.db
      .prepare(
        "UPDATE cf_sources SET status='failed',last_attempt=NULL,error='上次采集被中断，将自动重试' WHERE status='running' OR (status='failed' AND error='上次采集被中断，将自动重试')",
      )
      .run()
  }

  cleanup(now = Date.now()) {
    const cutoff = now - this.settings().retentionDays * 86400000
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM cf_items WHERE last_seen<? AND favorite=0 AND stage='discovered'")
        .run(cutoff)
      this.db.prepare("DELETE FROM cf_snapshots WHERE collected_at<?").run(cutoff)
      this.db.prepare("DELETE FROM cf_jobs WHERE started_at<?").run(cutoff)
      this.db.prepare("DELETE FROM cf_events WHERE created_at<?").run(cutoff)
    })
  }
  close() {
    this.db.close()
  }
}
