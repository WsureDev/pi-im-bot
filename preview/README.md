当前资源设计已更新为通用操作协议 v2，见 [资源修正](docs/GENERIC-RESOURCES.md) 和 [接口规范](docs/CONTRACT.md)。

# 插件编排、Provider 资源与权限管理预览

研究日期：2026-11-16（Asia/Shanghai）。本目录保留独立 Demo 的实现和研究记录。正式前端已接入真实 Bot 的资源、编排、权限与上下文接口，见 [正式控制面规范](../docs/framework/live-control-plane.md)。Demo 默认端口为 19385，正式服务默认关闭研究接口。

## 体验入口

- `/#/orchestration`：从左到右的分支管道；点节点查看处理器、归属、优先级和生效顺序。右上切换全局或插件范围，下方编辑区保持展开。完整图缩小时显示大标题，放大后显示处理器摘要。
- `/#/resource-providers`：按提供者展示实例与任意操作；提供者的配置表单、展示字段、发现结果由插件声明产生。
- `/#/capabilities`：当前预设的完整演示能力目录，指令与 Tool 入口开关、群聊与私聊的独立角色策略。
- `/#/trigger-context`：选择触发身份、聊天场景和入口，查看服务端构造的上下文、授权结果及不同处理分支。

建议顺序：先看编排图的“处理回复文字”；把绘图工具优先级从 50 调到 95 并保存，再切到该插件范围。随后在资源页注册“实验室语音提供者”并发现资源，查看其自动生成的音质/采样率配置。最后把 `/draw` 群聊策略依次设为“仅 Bot 管理”“Bot 管理 + 渠道管理”“任何人”，在触发页比较指令和 Tool、群内和私聊。

顶部“社区助手”和“创作沙盒”是两份独立预设，包含能力策略、编排覆盖与操作引用。保存采用版本检查；冲突时返回 409 并保留页面草稿。离开页面或切换预设时会提示尚未保存的修改。

## 研究结论与边界

图组件选择 **Vue Flow 1.48.2 + Dagre 3.1.3**，当前构建使用 Vue 3、UI SDK、Pinia、Vue Router 和 Vite。比较依据和 AstrBot 源码参考见 [RESEARCH.md](docs/RESEARCH.md)。资源接口、声明、生命周期、上下文信任边界见 [CONTRACT.md](docs/CONTRACT.md)。

这不是生产插件运行时迁移。现有 Bot 的七个真实切入点声明与排序算法被复用；演示注册项、预设、提供者、用户和群均为本地样例。Provider 发现不会访问服务地址，权限通过后只调用本地演示处理器，不运行 Pi/模型、QQ 发信、TTS 或 GPU 工作流。现有 MCP / Skill 页面保留，供应商服务页在此预览隐藏。

## 复现

```sh
bun install --frozen-lockfile
bun install --cwd dashboard --frozen-lockfile
bun run check
bun test tests
bun run test:preview
VITE_PREVIEW_RESEARCH=1 bun run build
bun preview/prepare.ts /tmp/pi-resource-demo/config 19385
BOT_CONFIG_DIR=/tmp/pi-resource-demo/config \
BOT_DATA_DIR=/tmp/pi-resource-demo/data \
BOT_WEB_DIR="$PWD/dist" \
BOT_PREVIEW_RESEARCH=1 bun src/main.ts
```

`prepare.ts` 只写入新的配置目录，禁用 OneBot、模型、插件执行器与主机执行能力；已有目录不会被覆盖。Core 使用自己的数据目录。研究配置另存于该目录的 `research-state.json`，串行修改、原子替换，权限 0600。删除或替换文件前必须停掉对应预览进程，不可直接覆盖运行中的状态。

`BOT_PREVIEW_RESEARCH=1` 才启用研究 API；`VITE_PREVIEW_RESEARCH=1` 才加入研究导航。维护仓库与生产配置不需要修改。稳定预览运行方式、精确路径及验证证据记录在实验归档的 `HANDOFF.md`。
