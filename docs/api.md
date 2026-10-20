# 工作台 API

基地址：`http://127.0.0.1:3000/api/cf`。写入请求使用 `Content-Type: application/json`。当前是本机单用户接口，没有公网账号认证；写入接口检查浏览器 Origin，但这不代替身份认证。

## 接口清单

| 方法 | 路径 | 请求 / 行为 |
| --- | --- | --- |
| GET | `/dashboard` | 热点、统计、主题、来源、设置、最新任务与能力 |
| POST | `/refresh` | 触发到期源采集；运行中返回同一任务 |
| GET | `/tags` | 返回主题数组 |
| POST | `/tags` | 新建主题 |
| PATCH | `/tags/:id` | 修改名称、关键词、排除词或开关 |
| DELETE | `/tags/:id` | 删除主题并重匹配，保留选题/收藏 |
| PATCH | `/sources/:id` | `{ "enabled": true }` |
| PATCH | `/settings` | `{ "intervalMinutes": 10 }`，只接受 10/30/60 |
| PUT / DELETE | `/topics/:id/favorite` | 幂等收藏 / 取消收藏 |
| PUT / DELETE | `/topics/:id/select` | 加入选题 / 移回热点池，仅操作 discovered/selected |
| GET | `/topics/:id/export` | 带 schemaVersion、完整选题与导出时间的 JSON |
| GET | `/health` | 应用、数据库类型与调度启用状态 |

来源列表、设置、任务进度通过 `/dashboard` 返回。当前没有独立 GET `/sources`、GET `/settings`、GET `/jobs/:id` 或写作/发布执行接口。

## 查询参数

`GET /dashboard?view=following&source=zhihu&tag=ai-model&days=1&page=1&sort=new&q=AI`

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `view` | `following` | `following` 匹配关注；`all` 全部；`favorites` 收藏；`selected` 已选题 |
| `source` | 空 | 单个源 ID |
| `tag` | 空 | 单个标签 ID |
| `q` | 空 | 本地标题/摘要子串查询，忽略大小写 |
| `days` | 1 | 最近观测时间窗口，限制 1–30 天；收藏/已选题视图不限制时间 |
| `page` | 1 | 页码，服务端限制范围；每页固定 30 条 |
| `sort` | `new` | `new` 按发现窗口交错来源；`rank` 优先当前在榜并按源内位置排序 |

### Dashboard 响应

```json
{
  "topics": [],
  "total": 0,
  "page": 1,
  "tags": [],
  "sources": [],
  "settings": { "intervalMinutes": 10, "retentionDays": 30 },
  "job": null,
  "stats": { "today": 0, "matched": 0, "favorites": 0, "selected": 0 },
  "capabilities": { "writing": false, "publishing": false },
  "automationEnabled": true
}
```

上例仅展示结构，不代表当前运行数据。`topics` 条目包含：

`id/sourceId/title/summary/url/rank/firstSeenAt/lastSeenAt/tags/favorite/stage/current/publishedAt`。

`tags` 包含标签 ID、名称及命中词。源状态包含 ID、启停、状态、最后请求/成功时间、错误、条数和失败次数。时间字段主要为 Unix 毫秒；`publishedAt` 可空，导出响应的 `exportedAt` 为 ISO 字符串。界面按上海时区显示。

统计中 today 为上海时区当天首次发现数，matched 为最近 24 小时观测且命中主题的条目数；两者不是同一个时间口径。

## 新增与修改主题

```json
{
  "name": "AI 编程",
  "keywords": ["Cursor", "Codex", "Copilot"],
  "excludes": ["卖课"],
  "enabled": true
}
```

新建返回完整主题对象，包含生成的 ID。PATCH 可只传要修改的字段。至少一个非空关键词；名称 1–30 字；每个词列表最多 30 个，每词最多 60 字；最多 20 个主题。

## 刷新与错误

`POST /refresh`：任务在运行时返回 HTTP 202，其他情况返回 200，响应为 `{ "job": ..., "message": "..." }`。没有到期源时不强制越过最小间隔。

常见状态码：400 输入无效或业务操作失败；403 浏览器跨来源写入；404 主题、选题、数据源或接口不存在。错误使用 H3 JSON 结构，客户端优先读取 `message`/`statusMessage`。来源的网络错误通常记录在 `sources[].error` 和 `job.results` 中，不会让已保存热点的查询一起失败。
