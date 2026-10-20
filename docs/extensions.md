# 扩展开发

## 设计原则

采集器只负责获取统一条目；Collector 负责执行策略；Store 负责持久化；UI 使用共享契约。写作和发布通过单独接口接入，沿用选题 ID 和来源，避免平台逻辑进入页面。

当前扩展接口是明确的开发边界，不意味着对应功能已实现。

## 新增数据源

1. 在 `shared/content-factory.ts` 添加源 ID、名称、展示元信息。类型会自动扩展。
2. 在 `providers.ts` 注册一个 `CollectionProvider`。如果沿用上游 getter，还需要在 `server/sources/`、上游源元信息中完成相应注册；独立 provider 不必实现上游接口。
3. 返回 `CollectedItem[]`，包含标题、URL、可选外部 ID、摘要与发布时间；实际请求必须支持 AbortSignal，并做格式/链接校验。
4. 声明 `minIntervalMs`，避免在调度器中硬编码平台名。仓储启动会为共享清单中新来源创建状态。
5. 添加正常结果、结构异常、空榜、超时取消与重复条目的测试，再在实际运行网络中实测。

```ts
const exampleProvider: CollectionProvider = {
  id: "example-feed",
  minIntervalMs: 10 * 60_000,
  async collect(signal) {
    // 请求固定、可信来源，传入 signal；解析并校验后返回统一条目。
    return fetchAndValidateExampleFeed(signal)
  },
}
```

上例为开发示意，`fetchAndValidateExampleFeed` 需要实现，不能直接复制当作已接通的来源。当前 UI 有“10 个源”的部分测试断言，扩展源清单时需同步更新 `scripts/smoke.mjs`。

## 阶段二：作者风格写作

接口位于 `server/services/content-factory/pipeline.ts`：

```ts
interface WritingProvider {
  id: string
  generate(
    input: {
      topic: Topic
      styleProfileId: string
      sources: { url: string; text: string }[]
    },
    signal: AbortSignal,
  ): Promise<{ title: string; markdown: string; citations: string[] }>
}
```

实现具体适配器后调用 `pipeline.registerWriter(provider)`；重复 ID 会报错。还必须补齐：

- 作者样文和风格档案的存储与版本。
- 可靠素材获取和事实核对，不能只凭热榜标题生成全文。
- article/draft/task 表、数据库迁移、异步执行和失败恢复。
- `selected → drafting → review` 状态机，以及真实创建/编辑初稿的 API 和页面。
- 模型凭据服务端配置、取消、预算与调用错误处理。

注册后 dashboard 的能力标记会反映注册表，但不会自动创建写作任务或 API；启用界面前应确保整个执行链完成。

## 阶段三：多平台发布

```ts
interface PublishingProvider {
  id: string
  publish(
    input: {
      articleId: string
      title: string
      markdown: string
      idempotencyKey: string
    },
    signal: AbortSignal,
  ): Promise<{ externalId: string; url: string }>
}
```

通过 `pipeline.registerPublisher(provider)` 注册。每个平台单独封装格式转换、认证与实际发布能力，发布前保留作者审核动作。消息通知 Webhook 与文章发布是不同能力，需要分别验证。

还需新增文章审核记录、每平台的发布任务与结果、幂等键唯一约束、重试及对账、账号凭据管理。当前接口定义了幂等键参数，但没有替未来平台实现幂等逻辑。

## 事件与规模扩展

已有事件：`topic.selected`、`topic.deselected`、`collection.completed`，保存在 `cf_events`。目前没有消费者；要自动触发后续工作，需要增加消费确认、去重、失败重试及持久任务机制，并避免保留期清理删除待处理事件。

当前 schema 标记为 1。新增表或列时实施有版本的迁移，保持旧选题 ID 与导出结构兼容。多实例运行前应替换进程内互斥、集中协调任务，并评估 SQLite 以外的数据库。

## 开发验证

```sh
npm run test:run
npm run build
npm run typecheck
node scripts/smoke.mjs
```

最后一条需要运行中的应用，会创建临时主题、修改一条选题并恢复；请在专用验收环境执行。验证外部写作/发布平台时区分测试凭据和真实账号，并明确记录哪些步骤会产生外部内容。
