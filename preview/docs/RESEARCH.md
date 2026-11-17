# 前端组件与 AstrBot 参考

## 选型

目标是查看真实 Bot 的从左到右分支管道，并在节点里管理插件注册项。无须让用户任意连线改变 Core 生命周期，也不需要 BPMN 引擎。

| 候选 | 与当前技术栈的关系 | 适用能力 | 本次判断 |
| --- | --- | --- | --- |
| Vue Flow | Vue 3 原生组件；所用 1.48.2 声明 Vue `^3.3.0`，覆盖项目的 3.3.4 | Vue 节点插槽、边、平移、缩放、视口、选择事件；可直接用现有响应式状态 | 采用；图形交互交给组件，节点详情和表单仍用 Vuetify |
| AntV X6 | 通用图编辑引擎；Vue 通过 `@antv/x6-vue-shape` 接入 | HTML/SVG 节点、端口、连线规则和复杂图编辑 | 成熟备选；本次只编辑注册属性，额外适配层收益较小 |
| LogicFlow | 面向业务流程的图编辑框架 | 流程建模、插件扩展、流程设计器 | 若以后要完整工作流编排可再评估；当前 Core 管道不需要另一套建模模型 |
| Dagre | 与 UI 独立的有向图布局库 | 分层有向图与 `rankdir: LR` | 与 Vue Flow 组合，让所有边从左向右，支持分支后汇合 |

选择基于原生 Vue 集成、所需交互与现有栈兼容性，并非性能基准排名。Demo 使用固定节点与依赖边，允许缩放、平移、检查节点和编辑注册项；不会把画布拖拽或连线假装成 Bot 已支持的执行语义。

锁定依赖：`@vue-flow/core@1.48.2`、`@vue-flow/background@1.3.2`、`@vue-flow/controls@1.1.3`、`@dagrejs/dagre@3.1.3`，精确版本及依赖完整性在 `dashboard/bun.lock`。上述选用包元数据均声明 MIT。Vue Flow 的 next 文档使用不同包名，本 Demo 使用稳定版 `@vue-flow/core` API。

原始资料：

- [Vue Flow 官方指南](https://vueflow.dev/guide/) 与 [自定义节点](https://vueflow.dev/guide/node.html)：Vue 节点、插槽和图交互。
- [Dagre 布局参数](https://github.com/dagrejs/dagre/wiki#configuring-the-layout)：布局方向与间距配置。
- [X6 官方仓库](https://github.com/antvis/X6) 与 [Vue 形状集成](https://github.com/antvis/X6/blob/master/site/docs/tutorial/intermediate/vue.en.md)。
- [LogicFlow 官方仓库](https://github.com/didi/LogicFlow)：流程图与工作流编辑定位。

## AstrBot 的可借鉴部分

参考源固定为 AstrBot v4.28.0、commit `a412146401426c0cdff8bbefb8627a03da519da8`，来自前一阶段归档的 `source/astrbot`。

- `dashboard/src/components/extension/componentPanel/components/CommandTable.vue`：直接使用 Vuetify 表格，呈现命令、所属插件、说明、权限与启用状态。本 Demo 沿用可直接浏览和编辑的表格，避免每个能力另设折叠面板。
- `astrbot/core/star/command_management.py`：汇总命令/命令组/子命令描述及插件归属，提供启停与权限修改。
- `astrbot/core/star/filter/permission.py`：参考版本主要是 `ADMIN` / `MEMBER` 两级判断，管理员通过 `event.is_admin()` 判定。
- `dashboard/src/components/extension/componentPanel/composables/useToolActions.ts`：Tool 列表、搜索、启停与权限操作。

本需求超出了上面的两级权限：补充当前渠道管理身份，群聊与私聊分别配置；将同一能力的命令别名及 Tool 映射到一个共同策略。Bot 管理、当前群管理员/群主、任何人形成可组合条件，不使用一个会跨群继承的“管理员”布尔值。

配置表单继续复用已有移植的 `AstrBotConfig`、`ConfigItemRenderer` 和秘密字段 keep/set/clear 协议。Provider 只声明配置和展示字段，不提供任意 HTML/JS 页面。图节点插槽只负责管道摘要；没有建立新的一套通用表单或组件框架。

## 图形表达与实际语义

使用现有 `src/plugins/hooks/points.ts` 提供七个切入点的 ID、说明、模式和可写字段，使用 `src/plugins/hooks/order.ts` 的 `orderHooks` 排序。优先级数字越大，满足依赖条件后越早被选择；相同优先级按注册 ID 排序。`before/after/requires` 约束优先于数字。

`collect`、`observe` 的处理器可能并发，图中顺序表示调度/合并次序，不承诺完成先后。`transform` 顺序应用补丁；`policy` 可否决；`select` 首个有效呈现器获选。全局和插件范围共用一个图组件与相同的服务端排序结果。

触发、Agent、指令、任务与平台交付是框架阶段。身份上下文和明确拒绝节点标注“方案新增”，说明它们在本 Demo 实现，不代表生产已经改造。图是允许分支后汇合的 DAG，而不是每个子节点只能有一个父节点的严格树，这与多个执行分支共享交付管道相符。

## 接入生产前的后续工作（本次未执行）

1. 把样例描述目录替换为插件 RPC 握手、当前安装代次及实际命令/Tool 注册表。保留现有 public Pi SDK 的工具循环。
2. 将 Provider 的注册、发现和执行纳入既有 worker 隔离、主机凭据代理、deadline、取消、配额和审计能力。禁止把任意第三方包导入 Core 进程。
3. 从真实平台事件和 Bot 身份目录构建上下文，将预设解析接入账号/群/会话选择。任务要保存权限上限并在执行及交付前复核，避免队列期间权限变更造成放大。
4. 将已有 GSVI/ComfyUI 服务配置迁移成 Provider 实例、稳定资源 ID 和绑定。迁移前提供可审查的映射与回滚，不在本 Demo 自动改生产数据。
