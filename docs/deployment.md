# 部署与运维

## 运行要求

Node.js 24+，pnpm 10.30.3，单个常驻应用实例及可写数据目录。当前业务数据库依赖 `node:sqlite`，请使用 Node 运行；沿用上游的 Cloudflare/Vercel 配置不能直接承载当前完整应用。

## 从仓库启动

```sh
git clone https://github.com/qiuquanhui/content-factory.git
cd content-factory
npx pnpm@10.30.3 install --frozen-lockfile
npm run dev
```

打开 [本机工作台](http://127.0.0.1:3000/)。开发服务与生产服务都使用 3000 端口，不要同时启动。Windows PowerShell 如果限制 npm.ps1，可使用 `npm.cmd` / `npx.cmd`。

## 生产构建

```sh
npm run test:run
npm run build
npm run typecheck
npm start
```

`npm start` 默认监听 `127.0.0.1:3000`。进程停止后不会采集；需要长期运行时使用适合宿主环境的服务管理器，或使用下方容器的 restart 策略。

## 环境变量

可将 `.env.example` 复制为 `.env.server`，不配置也可使用第一阶段功能。

| 变量 | 默认 / 作用 |
| --- | --- |
| `CF_DATABASE_PATH` | 默认相对于进程工作目录的 `.data/content-factory.sqlite`；生产建议使用固定绝对路径 |
| `CF_AUTOCOLLECT` | 仅值 `false` 关闭自动调度，手动刷新仍可用 |
| `HOST` / `PORT` | 自定义 Node 入口时使用，`npm start` 脚本会固定为本机与 3000 |

使用 PowerShell 启动自定义端口的示例：

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
$env:CF_DATABASE_PATH = 'E:\content-factory-data\content-factory.sqlite'
node --use-env-proxy --env-file-if-exists=.env.server dist/output/server/index.mjs
```

第一阶段不需要模型密钥、GitHub OAuth 或发布账号。根目录 `example.env.server` 是保留的上游示例，当前工作台配置优先参考 `.env.example`。

## Docker Compose

```sh
docker compose up --build -d
docker compose logs -f content-factory
docker compose down
```

Compose 端口仅绑定 `127.0.0.1:3000`，数据持久化在 `factory_data` 命名卷，容器目录 `/usr/app/.data`，并配置 `restart: unless-stopped`。关闭容器不会删除卷；不要在需要保留数据时执行 `down -v`。

Dockerfile 使用 Node 24 镜像，构建时安装锁定的 pnpm 和依赖。容器配置已提供，是否在当前机器实际构建过请查看 [验证记录](verification.md)。

## 数据备份与恢复

SQLite 使用 WAL；不要在写入期间只复制主数据库文件。

简单可靠的本机备份流程：正常停止应用 → 复制完整 `.data` 目录到单独备份目录 → 重新启动。自定义数据库路径时备份其主文件及关联 WAL/SHM 文件。也可以另行使用 SQLite 一致性备份工具。

恢复时先停止写入，保留现有数据的副本，再将备份放回原数据路径，启动并检查主题、收藏和选题。普通历史默认保留 30 天，收藏和已选题条目保留；快照、任务、事件仍按保留期清理。

## 健康检查与排障

| 现象 | 检查方式 |
| --- | --- |
| 页面无法访问 | 检查进程与端口，访问 `/api/cf/health` |
| 数据不更新 | 检查机器是否休眠、CF_AUTOCOLLECT、源开关、最后尝试时间 |
| 某个平台失败 | 设置 → 数据来源；查看平台限流、超时或解析信息；其他源仍可用 |
| 刷新未立即请求 | 查看源最小间隔与连续失败后的退避，不需要高频点击 |
| 页面暂无相关内容 | 切换全部热点、扩大时间范围、检查关键词与排除词 |
| 数据库打不开 | 检查固定路径、目录写权限和是否多实例同时使用；先备份再处理 |

当前未实现公网账号体系。要开放到公网或多人使用，先补齐认证、访问控制与部署方案。多实例扩容需要任务协调及仓储调整，不应直接启动多个副本共用 SQLite。
