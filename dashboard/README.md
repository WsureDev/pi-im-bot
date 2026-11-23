# Pi Dashboard

Pi IM Bot 的工作台有 12 个按需加载的导航入口，覆盖聊天、编排与权限、配置与资源、后台任务、计划以及 QQ 接入。使用 Vue 3、UI SDK、Pinia、Vue Router、Axios 和 Vite，由 Bun 管理依赖。

上游固定为 AstrBot v4.28.0，commit `a412146401426c0cdff8bbefb8627a03da519da8`。原路径及文件 SHA-256 记录在 [UPSTREAM.json](UPSTREAM.json)，修改范围和许可见 [NOTICE.md](NOTICE.md)。配置表单和聊天界面沿用上游业务逻辑。交互控件使用锁定版本的 UI SDK Vue 适配器，布局和管理表格位于本项目的 src/ui。选型依据及功能边界见 [Sink 复审](../docs/framework/dashboard-ui-sdk.md)。

## 构建与开发

在仓库根目录执行：

```sh
bun install --frozen-lockfile
bun run install:dashboard
bun run check
bun run test:dashboard
bun run build
bun run start
```

Dashboard 使用独立 TypeScript 5.1.6 与 vue-tsc 1.8.8，Core 保持自己的 TypeScript 工具链。锁文件同时固定直接与间接依赖。Dockerfile 在构建时安装两份锁文件并生成静态产物。

`bun run dev:dashboard` 启动 Vite，`BOT_API_URL` 指定 HTTP/WebSocket 后端。生产由原 Hono 服务提供 `dist/`；启动阶段不会重新构建前端。`BOT_WEB_DIR` 控制构建和服务的静态目录，适合隔离验证和版本切换。

编辑器使用本地 Monaco 和 worker，在编辑区进入视区后按需加载，预留固定高度以保持布局稳定。设置分组、人格和其他常用配置直接展开；导航负责定位，保存操作保持可见。MDI 使用固定上游的字体子集。页面不依赖 CDN 字体、VAD/ONNX 脚本或另一套生产 Web 服务。

## API 与编辑语义

- `api/http.ts` 使用 Axios 和 Core 的 Zod 契约；失败的写请求不自动重放。安装进度核对原安装记录，执行状态和交付状态分别显示。
- Pinia 更新房间、消息、任务、执行和连接状态。快照加载期间的事件在返回后合并；后台房间事件不会切换用户当前渠道。
- 配置草稿与服务端快照分开保存。路由、范围切换和编辑弹窗退出使用工作台确认对话框；409 保留当前草稿。聊天草稿按渠道保留在内存中。
- 插件配置读取 `/api/plugins/:id/configuration`，按完整 definition 渲染，保留嵌套、条件、秘密字段、默认值和元数据。秘密保留/替换/清除通过独立 actions 提交，模板条目使用稳定 UUID。
- 凭据使用 UI SDK 密码框，可用鼠标或键盘切换显示。打开编辑表单时通过带版本检查、no-store 的私密读取取得该对象的已保存值；默认掩码。直接编辑即可替换，清空后保存即可清除；未修改时保留原值。常规状态和列表仍隐藏秘密值。
- 范围覆盖提交稀疏值，恢复继承移除覆盖；恢复 schema 默认值是显式赋值。Bot 的资源选择保持完整 `mode/ids` 对象语义，支持 selected 加空数组。
- 音色选项读取 Core 缓存，搜索保留全部选项及当前选择；无缓存提供文本输入。页面打开不会直接请求 GSVI。

详细页面与验证清单见 [前端迁移记录](../docs/framework/dashboard-migration.md)。

设置页布局、配色及编辑器的后续调整见 [视觉与交互优化](../docs/framework/dashboard-visual-polish.md)。

## 实际数据控制面

正式构建增加编排、资源提供者、指令与 Tool、触发上下文四个页面，使用 `/api/control` 读取真实插件和配置范围。研究构建仍可使用 `VITE_PREVIEW_RESEARCH=1`；正式构建不设置该开关。接口、资源插件声明和权限语义见 [正式控制面规范](../docs/framework/live-control-plane.md)。
