# 参与开发

本项目是基于 NewsNow 改造的 AI 热点选题工作台。请先阅读 [文档入口](docs/文档目录.md)、[架构说明](docs/架构说明.md) 和 [扩展开发](docs/扩展开发.md)。

## 本地验证

使用 Node 24+ 与 pnpm 10.30.3：

```sh
npx pnpm@10.30.3 install --frozen-lockfile
npm run test:run
npm run build
npm run typecheck
```

首次构建会生成前端自动导入及服务类型，之后可独立执行类型检查。`node scripts/smoke.mjs` 需要运行中的验收实例，会创建并恢复临时测试数据。

## 修改边界

- 新业务优先放在 `server/services/content-factory/`、`server/api/cf/` 和 `src/factory/`。
- 平台差异封装在采集、写作或发布适配器中，避免让页面理解平台认证和协议。
- 不把数据库、环境配置、Cookie、账号凭据或构建产物提交到仓库。
- 保留 MIT 许可证和上游来源；复用代码前检查其许可证。
- 功能变更同步更新对应文档，提供相关测试结果与已知限制。

GitHub Actions 在 main 推送与 PR 时执行依赖安装、测试、构建和类型检查。原始上游贡献说明保留在 [docs/上游贡献说明.md](docs/上游贡献说明.md)。
