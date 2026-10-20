import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"

const base = process.argv[2] || "http://127.0.0.1:3000"
const checks = []
async function api(path, method = "GET", body, expected = 200, headers = {}) {
  const response = await fetch(`${base}/api/cf/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.equal(response.status, expected, `${method} ${path}`)
  return response.json()
}
function pass(name) {
  checks.push({ name, status: "passed" })
  console.log(`PASS ${name}`)
}

assert.equal((await fetch(base)).status, 200)
assert.equal((await api("health")).status, "ok")
pass("production page and database health")
const dashboard = await api("dashboard?view=all")
assert.equal(dashboard.sources.length, 10)
assert.equal(dashboard.capabilities.writing, false)
assert.equal(dashboard.capabilities.publishing, false)
pass("10 collection sources and honest extension capabilities")
await api("settings", "PATCH", { intervalMinutes: 1 }, 400)
await api("tags", "POST", { name: "Invalid", keywords: [] }, 400)
await api("refresh", "POST", undefined, 403, { Origin: "https://unrelated.example" })
pass("validation and cross-origin mutation rejection")

let tag
try {
  tag = await api("tags", "POST", { name: "__api_smoke_test__", keywords: ["OpenAI"], excludes: [] })
  const matches = await api(`dashboard?tag=${tag.id}`)
  assert(matches.topics.every((topic) => topic.tags.some((match) => match.id === tag.id)))
  await api(`tags/${tag.id}`, "PATCH", { keywords: ["__no_match_in_any_title__"] })
  assert.equal((await api(`dashboard?tag=${tag.id}`)).total, 0)
  pass("tag creation and synchronous historical rematching")
} finally {
  if (tag) await api(`tags/${tag.id}`, "DELETE")
}

if (dashboard.topics[0]) {
  const topic = dashboard.topics[0]
  try {
    await api(`topics/${topic.id}/favorite`, "PUT")
    await api(`topics/${topic.id}/favorite`, "PUT")
    assert((await api("dashboard?view=favorites")).topics.some((item) => item.id === topic.id))
    if (["discovered", "selected"].includes(topic.stage)) {
      await api(`topics/${topic.id}/select`, "PUT")
      assert((await api("dashboard?view=selected")).topics.some((item) => item.id === topic.id))
    }
    const exported = await api(`topics/${topic.id}/export`)
    assert.equal(exported.schemaVersion, 1)
    assert.equal(exported.topic.url, topic.url)
    pass("idempotent favorite, selection and provenance export")
  } finally {
    await api(`topics/${topic.id}/favorite`, topic.favorite ? "PUT" : "DELETE")
    if (["discovered", "selected"].includes(topic.stage))
      await api(`topics/${topic.id}/select`, topic.stage === "selected" ? "PUT" : "DELETE")
  }
}
const end = await api("dashboard?view=all")
assert.equal(end.stats.favorites, dashboard.stats.favorites)
assert.equal(end.stats.selected, dashboard.stats.selected)
pass("test mutations restored without changing existing favorites or selections")
mkdirSync(".data", { recursive: true })
writeFileSync(
  ".data/smoke-report.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      base,
      checks,
      stats: end.stats,
      sourceStates: end.sources,
      latestJob: end.job,
    },
    null,
    2,
  ),
)
console.log(`${checks.length} smoke checks passed`)
