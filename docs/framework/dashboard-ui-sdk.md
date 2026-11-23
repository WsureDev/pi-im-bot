# 工作台 UI SDK 迁移评估

2026-11-23 在 `front` 分支按产品能力复审。该分支基于已升级 Pi Durable 1.6.0 的主线。结论是 UI SDK 可以承担工作台通用交互层。Vue、Pinia 和 Vue Router 继续负责应用状态与路由。上线后需要由项目维护布局、配色、响应式规则和管理表格。

## Sink 示例与实际落点

本次检查的上游版本索引有 145 个示例。Sink 页面用 React 展示交互，项目接入对应 Vue 适配器。浏览器中另外操作了地区弹窗与播放列表标签。复核时应配合示例源代码和本项目的真实数据路径判断覆盖范围。[Sink](https://ui-sdk.dev/sink) · [固定版本示例索引](https://github.com/vercel-labs/ui/blob/f01f1739644ce83a0ba09fafc591d4050a2bbe83/apps/docs/app/sink/bento/uses.generated.ts)

| 工作台能力 | 对应示例 | 在 Pi 中的实现 |
| --- | --- | --- |
| 插件与 Bot 配置 | [密码、分组开关、文件](https://ui-sdk.dev/sink?only=forms-new-password,forms-alerts,forms-passport) | Input、PasswordInput、Switch、Checkbox、Slider、Select、Combobox、FileInput。Pi 继续负责字段类型、继承、模板条目、秘密编辑和服务端版本检查。 |
| 导航、弹窗与执行动作 | [命令搜索、地区弹窗、播放列表](https://ui-sdk.dev/sink?only=overlays-palette,overlays-region,collections-now-playing) | 跨页面及渠道搜索支持 Ctrl/Cmd+K。移动导航、确认、菜单和选项卡采用 SDK 的焦点与键盘处理。 |
| 管理表格 | [待办列表、发票分页](https://ui-sdk.dev/sink?only=collections-backlog,collections-invoice-pages) | 应用共享 HTML 表格实现筛选、三态排序、行展开、操作插槽与窄屏横向滚动，分页使用 SDK。排序和翻页后行操作仍对应源记录。 |
| 跟踪消息与执行过程 | [聊天跟随、发布时间线、请求瀑布](https://ui-sdk.dev/sink?only=studio-chat,collections-release-history,collections-request-waterfall) | 聊天在底部跟随新消息，回看时可跳到最新。运行详情按时间列出事件，有 durationMs 的步骤另外绘制耗时条。 |

## 专用引擎与维护边界

- Monaco 继续加载本地编辑器与 JSON worker，首次进入编辑区时加载。
- Markstream Vue 继续渲染流式 Markdown、代码块与富文本。Vue Flow 和 Dagre 继续处理节点、边、自动布局与视口。
- UI SDK Vue 和 Core 同时锁定在 `0.1.0-beta.13`，Vue 锁定在 `3.5.46`。SDK 处于 beta，后续升级应重验弹层关闭、焦点返回、控件事件和表格行操作。
- 生产与研究构建共享组件。主题偏好沿用浏览器存储，后端 API、房间事件、插件配置及编辑草稿继续使用现有契约。

## 审核入口

可从「模型与 Provider」检查分页和展开，从「计划任务」检查创建、菜单和取消确认，从「插件中心」检查文件与凭据。聊天的「任务与追踪」展示本次运行的数据。仓库验证命令见 [Dashboard README](../../dashboard/README.md)。

## 构建与验收记录

使用相同 Bun 和 Vite 构建主线 `4798d77` 与本分支。下表只计 HTML 直接引用的入口文件，分别以 gzip 压缩。Monaco、Markdown 和路由异步块按需下载，实际页面加载量还取决于访问的页面和缓存。

| 入口资源 | 主线 | front |
| --- | ---: | ---: |
| JavaScript | 224,672 B | 253,798 B |
| CSS | 47,816 B | 18,830 B |
| 合计 | 272,488 B | 272,628 B |

正式和研究模式都完成了构建。共享 Chromium 检查了正式模式 12 个入口及研究模式 4 个专属页面，并操作了分页排序、计划菜单、离开确认、Monaco 加载、Vue Flow 画布和手机导航。独立 Hono/Bun 实例验证了图片上传及重载、凭据保留/替换/清空、模板稳定 ID、数值零和布尔假值、409 草稿，以及离线聊天的 WebSocket 消息与工具回执。耗时图用已知的 90 ms 和 300 ms 记录验证，图条和数字均与输入一致。
