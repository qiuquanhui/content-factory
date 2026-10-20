# 阶段一：开源热点采集项目调研

调研日期：2026-10-14（Asia/Shanghai）。状态：供人工评审。

## 1. 结论与评价口径

推荐 **有条件采用 NewsNow 作为二次开发基础**；TrendRadar 是功能完整度更高的备选；DailyHotApi 留作特定源适配参考，不在首版同时集成。

Star/Fork 反映社区关注和使用规模，适合初筛。Issue 总数高也可能意味着使用广、缺陷多、功能请求多或积压多，不能简单认定“越高质量越好”。本次还核对了真实 Issue 开关数量、最近提交内容、源码结构、测试内容、部署方式和复用成本。

以下为公开 GitHub API 在本次会话内依次查询的快照，非原子快照，数字可能随时变化。只比较原仓库，不以 Fork 仓库数据替代。

## 2. 社区与维护数据

| 项目 | Star | Fork | 未关闭 Issue | 已关闭 Issue | 最近默认分支提交日期 | 许可证 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| [NewsNow](https://github.com/newsnext/newsnow) | 22,031 | 5,995 | 142 | 102 | 2026-10-13 | MIT |
| [TrendRadar](https://github.com/sansan0/TrendRadar) | 62,895 | 24,904 | 29 | 470 | 2026-10-13 | GPL-3.0 |
| [DailyHotApi](https://github.com/imsyy/DailyHotApi) | 4,090 | 1,351 | 25 | 55 | 2026-03-11 | MIT |

三个项目查询时均未归档。NewsNow 的旧地址 `ourongxing/newsnow` 已重定向至 `newsnext/newsnow`，引用使用现地址。

数据口径：仓库 REST API 的 `open_issues_count` 包含未关闭 PR，三个项目分别为 158、31、30，不能直接当作 Issue 数。表中的 Issue 数来自搜索 API 的 `repo:... is:issue is:open/closed` 查询。已关闭不等于已修复，重复、无效和非缺陷内容也会关闭；本次未测算问题修复率或维护者平均响应时间。

核验入口：[NewsNow API](https://api.github.com/repos/newsnext/newsnow)、[TrendRadar API](https://api.github.com/repos/sansan0/TrendRadar)、[DailyHotApi API](https://api.github.com/repos/imsyy/DailyHotApi)。精确版本见本目录 `github-snapshot.json`。

## 3. NewsNow：复用成本最低，但有维护风险

### 3.1 已检查的实现

本次检查版本：`0560c993b226cd2fd07d8a79875d50551f52c584`，`package.json` 版本 `0.0.43`。

| 源码位置 | 实际能力 | 对阶段一的意义 |
| --- | --- | --- |
| `server/sources/*.ts` | 各平台独立采集器 | 尽量直接复用，避免从零编写平台请求和解析 |
| `server/getters.ts` | 将采集器注册为统一 getter | 后台任务可在同一进程直接调用，无须绕 HTTP 请求自身 |
| `shared/pre-sources.ts` | 平台与子榜单、更新间隔、禁用标记 | 直接复用源标识与元数据 |
| `shared/types.ts` | `NewsItem`、`SourceResponse` 类型 | 复用上游数据结构，应用层补充字段 |
| `server/api/s/index.ts` | 单源查询、缓存复用、失败回退 | 可保留兼容；它不是完整的订阅任务服务 |
| `server/database/cache.ts` | 每源保存一份最新缓存 | 不是历史库，需要新增快照与条目表 |
| `server/utils/fetch.ts` | 默认 10 秒超时、3 次重试 | 复用请求基础能力；需避免外层重复重试 |
| `src/` | React 页面、路由和请求状态基础 | 小幅改造为作者选题页 |
| `nitro.config.ts` | Node 服务和 SQLite 连接配置 | 可以单应用部署 |

固定源码入口：[采集器注册](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/server/getters.ts)、[接口](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/server/api/s/index.ts)、[统一类型](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/shared/types.ts)、[数据源元信息](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/shared/pre-sources.ts)。

### 3.2 必须理解的能力边界

- 热榜采集器通常返回标题、链接、源内 ID，部分源附带摘要、热度说明或发布时间；它不等于文章全文抓取器。
- 已读的单源接口会对结果 `slice(0, 30)`；知乎当前采集器请求参数为 `limit=20`。不能承诺每个平台都有 50/100 条。
- 接口只有源 ID 和刷新相关参数，没有按任意标签搜索全站的能力。标签应在采集后匹配，多个标签共享一次采集。
- `status=success` 也可能来自源更新间隔内的缓存，且此分支将 `updatedTime` 设为当前时间。不能把此字段直接显示为“刚刚从平台更新”。后台设计应记录真实请求及缓存来源。
- 微博适配器使用 HTML 解析及源码内 Cookie；抖音适配器先请求登录域名获取临时 Cookie。这里都存在平台变化导致失效的可能。
- 某些源有 Cloudflare 环境禁用标记，因此首版建议常驻 Node 服务，不依赖无服务器页面托管完成调度。

对应源码：[微博](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/server/sources/weibo.ts)、[抖音](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/server/sources/douyin.ts)、[知乎](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/server/sources/zhihu.ts)。

### 3.3 质量证据与限制

正向证据：平台适配器与页面分离，类型定义集中；已有 lint/typecheck/test 命令；有日期解析测试；提供 Docker 构建及发布工作流。近期提交并非仅改文档：2026-09-16 修复过多个数据源，2026-10-12 修复 Kaopu/AIHOT RSS 源。

限制：`test/common.test.ts` 仅有一个空测试；日期测试不能证明平台采集稳定。所查两个 GitHub 工作流用于发布与 Docker 构建，没有看到覆盖六个目标源的持续集成验证。本次未运行测试，也没有覆盖率报告，不能宣称“测试充分”。

更关键的是 [README](https://github.com/newsnext/newsnow/blob/0560c993b226cd2fd07d8a79875d50551f52c584/README.md) 公告 NewsNext 即将推出，且不再接受贡献。这不等于仓库已归档，但意味着不能假定后续补丁会被上游接收。我们应固定版本、将应用功能放在新增模块、维护少量补丁，并在未来评估新版本兼容性。

Issue 抽查：[源停止更新 #372](https://github.com/newsnext/newsnow/issues/372)、[页面错误 #373](https://github.com/newsnext/newsnow/issues/373)、[小红书需求 #366](https://github.com/newsnext/newsnow/issues/366)。这些是风险证据和需求记录，不代表本次已经复现了对应问题。

### 3.4 判断

工程结构适合小规模二次开发，现成页面和采集器能显著降低首版成本。**在接受自行维护少量源补丁，并通过目标环境 PoC 的前提下推荐采用；不将其评价为已经证明生产可靠的系统。**

## 4. TrendRadar：筛选和调度功能最贴近需求

检查版本：`ceabb027fe9bbdafec59dbbfa12cb46c2ba256ce`，版本 `6.11.0`。

它已具备关键词分组、必须词、排除词、正则、调度、历史存储、HTML 报告和通知等能力。检查了 `trendradar/crawler/fetcher.py`、`trendradar/core/frequency.py`、`pyproject.toml` 和 Docker Compose，测试目录包含筛词、时间、配置序列化和存储同步等测试。

源码中的 `DataFetcher.DEFAULT_API_URL` 指向 NewsNow API，并允许自定义 `api_url`；请求形式是 `?id=...&latest`。所以它是 NewsNow 上层的监控分析工具，**无法作为 NewsNow 平台适配器失效时的独立备用采集链路**。[抓取源码](https://github.com/sansan0/TrendRadar/blob/ceabb027fe9bbdafec59dbbfa12cb46c2ba256ce/trendradar/crawler/fetcher.py)。

正向证据：社区规模最大，近期提交覆盖过滤、RSS、存储、时间解析等实际修复，部分提交关联 Issue。适合“配置关键词后自动监控并输出报告”的需求。

接入代价：项目以 Python、配置文件和报告/通知工作流为主；要成为持续扩展的作者工作台，仍需处理页面标签编辑、收藏 API、数据接口和后续写作状态。自部署数据源时还要运行 NewsNow。直接复用其核心代码前，应明确接受 GPL-3.0 许可与项目后续发布安排，不能假定其许可与 MIT 相同。[项目及许可入口](https://github.com/sansan0/TrendRadar)。

判断：如果你优先要快速获得关键词监控和报告，且愿意使用现有界面/配置方式，它可以成为首选。本方案优先考虑“一页完成选题、方便后续写作、小规模单应用”，因此列为第二选择，不同时接入两套调度和存储。

## 5. DailyHotApi：接口清晰，当前维护节奏偏慢

检查版本：`36c77e3bd891c11642d314cfb229bf31646704de`，版本 `2.0.8`。

使用 TypeScript/Hono，每个平台一个路由文件，提供统一响应与缓存。`src/utils/getData.ts` 封装请求，`cache.ts` 提供内存缓存和 Redis 相关实现；Redis 不是我们首版必须引入的组件。检查的 `package.json` 有 lint/build，但没有 test 脚本。

不足：最后默认分支提交为 2026-03-11，比另两个项目更久。Issue 包括 [所有接口无法访问 #139](https://github.com/imsyy/DailyHotApi/issues/139)、[百度接口问题 #132](https://github.com/imsyy/DailyHotApi/issues/132)、[抖音 Cookie 问题 #126](https://github.com/imsyy/DailyHotApi/issues/126)。这些反馈不能推导所有自部署实例均不可用，但足以要求实际复测。

判断：纯 API 的封装方式很好理解，但页面、标签、任务和历史仍需补齐；当前不作为优先底座。未来若某个源有已验证更可靠的实现，可单独评估适配，不能假定“换 API 项目”就解决同平台的限制。

## 6. 方案比较

| 方案 | 已有能力复用 | 主要新增工作 | 运行组件 | 评价 |
| --- | --- | --- | --- | --- |
| NewsNow 固定版本小改 | 平台采集、类型、请求、缓存、页面、服务 | 标签、后台调度、历史、收藏、精简首页 | 一个 Node 应用 + SQLite 文件 | 推荐，需承担上游收缩维护的风险 |
| TrendRadar 上层封装 | 监控、关键词、调度、历史、报告 | 产品页面与服务接口；自建源时再部署 NewsNow | Python；通常还涉及 Node 采集源/页面 | 现成监控功能强，但集成面更多 |
| DailyHotApi 上层封装 | 平台路由、统一 API、缓存 | 页面、标签、调度、历史、收藏 | Node 应用及业务模块 | 较轻，但当前维护证据较弱 |
| 从零写多平台采集器 | 少 | 各源请求、解析、容错及业务全部自建 | 自定 | 不符合本项目减少改动的目标 |

## 7. 开发前的验证门槛

方案确认后，先做一次最小可行验证，再进入完整开发：

1. 在实际运行网络中构建并启动固定版本，核实 Node/依赖/SQLite 原生模块兼容性。上游 Dockerfile 固定较旧 Node 版本，不能直接认定和当前依赖锁文件兼容。
2. 微博、知乎、百度、今日头条、抖音、B 站热搜各做三轮、间隔 10 分钟的实际采集，记录 HTTP/解析结果、有效条数、耗时及缓存来源；不向公共演示站发密集请求。
3. 核实返回数据能支持“标题、原文链接、榜单位置”，识别额外字段是否缺失。
4. 六个目标源全部通过才按原范围继续；任何必须源长期不可用，先给出修复/替换/延期的明确结果并找用户确认，不静默删减平台。
5. 保留调研版本和测试证据。本次调研不包含上述运行验证。

以上依据可追溯至公开仓库和固定 SHA；推荐结论属于针对本项目目标的工程判断。
