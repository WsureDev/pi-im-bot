# Dashboard 前端迁移

以 AstrBot v4.28.0 的固定源码为上游，统一替换原 `web/` 手写 DOM。前端位于 `dashboard/`，采用 Vue 3 / Vuetify / Pinia / Vue Router / Vite；Core 继续提供原 HTTP、WebSocket 和静态资源服务。

## 页面与接口对应

| 原入口及功能                                                        | 新入口                                     | 主要接口                                                                |
| ------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| 聊天、渠道、上下文、引用、媒体、撤回、实时输出与追踪                | `#/chat/:roomId?`                          | `/api/state`、`/api/rooms/*`、`/api/events`、媒体及 Artifact 资源       |
| 默认、账号、房间、会话设置与人格                                    | `#/settings`                               | `/api/framework`、房间与 conversation PATCH                             |
| 插件列表、配置层级、秘密、授权、服务绑定                            | `#/plugins/:pluginId?`                     | `/api/plugins`、configuration、order、management PATCH                  |
| 插件发现、目录源、安装、更新、取消、历史版本、文档、导出            | 插件中心「发现与安装」「使用方法与版本」   | market、installations、install、update、releases、documents、archive    |
| 插件运行环境与编排                                                  | 插件中心「运行环境」「编排」「范围与顺序」 | runtime、runtime/probe、pipeline、order                                 |
| Provider、模型、Header/Body、远端列表、显式测试、主选及 fallback 组 | `#/providers`                              | providers/config、providers、models/list、models/test、provider-groups  |
| OneBot 配置、明确选择群、发现列表与路由状态                         | `#/onebot`                                 | onebot/settings、groups/refresh、实时 onebot_status                     |
| MCP、Task 策略、Skill、GSVI、Comfy、工作流、存储、观察任务          | `#/resources`                              | resources、plugins/storage、plugins/observers                           |
| Cron、启停、立即执行、停止、权限刷新、删除                          | `#/schedules`                              | schedules、run、stop、authorize、PATCH/DELETE                           |
| 后台任务、完整历史分页、修订、取消、核对未知结果、交付回执与产物    | `#/jobs`                                   | rooms/:id/jobs、history、update、cancel、reconcile、delivery、artifacts |

界面只使用实际已存在的 Pi 接口。执行完成、安装完成、交付受理和平台已发送分别读取相应状态，不通过乐观提示替代结果。写请求不会自动重试。

## 配置与交互边界

AstrBotConfig 及其上游子组件保留完整字段元数据。修改包括按 definition 枚举缺省/秘密字段，接入秘密 actions、稀疏继承、稳定模板 UUID、GSVI 缓存选项和未保存确认。所有新增基础控件直接使用 Vuetify。

GSVI 保留 13 个叶字段、嵌套 preset、三项秘密动作及原概率滑块。缓存选项保留当前值并支持完整搜索；无缓存时可手填。浏览器只读 Core 缓存，页面打开不直接访问语音服务。

配置事件只更新服务器状态，编辑草稿独立保留；409 冲突展示错误并保留草稿。列表/字典局部编辑和路由/范围退出使用上游确认对话框。恢复默认和恢复继承使用不同的提交语义。聊天草稿按渠道存于 Pinia 内存，不写入浏览器持久存储。

## 构建与运行

`bun run build` 在发布阶段调用 Vite。`src/main.ts` 启动时检查已有 index 并读取静态产物，不再导入构建脚本。`BOT_WEB_DIR` 同时支持独立构建和运行目录；原生产 Hono 服务即可承载新界面。

页面按路由拆分，Markdown 与 Monaco 独立分包，Monaco/worker 在显式打开编辑器时加载。字体使用固定上游的 MDI 子集。旧 DOM 源码与早期独立预览脚本已从当前源码移除；历史可由 Git 和部署回滚副本恢复。

## 验证记录

- Core 既有测试：188 通过、0 失败；前端纯配置协议测试覆盖秘密动作、0/false/空串、稀疏继承、模板身份和大量缓存选项。
- Core TypeScript 与独立 vue-tsc 检查通过；Vite 生产构建通过。
- 共享浏览器在隔离 Bot 上完成八个入口与配置详情检查，未发现页面异常或失败请求。
- 实际隔离 Core 验证 GSVI 字段和秘密动作保存、配置事件保留焦点与草稿、真实 revision 冲突保留草稿、未保存确认、聊天草稿跨页及离线 Pi 对话、停用 Provider 保存、字段条件/只读和 390px 深链接布局。
- 补充界面验收覆盖范围稀疏覆盖/恢复继承、schema 默认值、1500 项缓存选项搜索、Monaco 按需加载及 JSON 替换保存、模板 UUID 与秘密路径、MCP/Skill、禁用状态的 OneBot 配置、停用 Cron、后台任务、附件上传和流式 Markdown。22 项场景通过，页面异常为 0。
- 正式服务仅进行了 9 组 GET 契约核对，均与新客户端匹配。编辑、保存和消息验收使用独立配置、数据及禁用执行环境的自编插件样本。

语音缓存的大列表使用可追溯的测试响应；没有请求真实 GSVI 音色、合成或音频下载，也没有调用真实 LLM、QQ 或 ComfyUI。容器和运行数据不属于此迁移的修改范围。

部署应先核对已构建产物与校验清单，保存原静态目录，再切换入口。验证部署后的 index、静态资源和 API；异常时恢复原静态目录。详细执行回执和截图保留在本次实验的本机归档中，不进入源码仓库。
