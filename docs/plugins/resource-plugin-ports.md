# 独立资源与原生插件移植接口

GSVI 和 ComfyUI Pro 使用独立资源协议；资源实例不依赖消费插件存在。原插件配置页保留完整原字段，连接凭据和文件目录由资源实例托管。现有 `service:*` 是旧接口，新插件使用 `resource(context, alias)`。

## 资源

- `pi.gsvi@1` / `gsvi-http`：`catalogue`、`catalogue_read`、`voice_options`、`synthesize`。完整目录以受管 JSON/文本产物引用和分页传递，音频经 WAV 校验。
- `pi.comfy-workflows@1` / `comfyui-http`：工作流文件选项、模型声明、原始 JSON 保存、步骤 sidecar、LoRA 目录和预演、submit/poll/recover/peek/reconcile/cancel。资源自己的持久目录首次复制原版三个模板；可显式选择自定义目录。扫描只读模型文件名和 metadata，不载入权重。
- `pi.text-generation@1` / `framework-model`：复用当前聊天模型组或明确指定的组，携带原人格，做一次无工具文本请求。fallback 仍局限于单个请求，不另起 Agent 循环。

`registered` 运输方式只能引用 Core 已登记的可信适配器，不允许包上传宿主模块。HTTP/MCP 声明式资源仍使用原接口；没有新增必须由框架穷举的业务资源分类。

Comfy `submit` 的同一 Job/revision/item 只有一份持久回执。查询、取消和恢复都操作原 prompt_id，不使用全局 interrupt；已知排队任务可精确删除，运行中的取消只能停止本地等待并保留核对入口。资源配置/凭据/绑定变化会撤销旧调用和迟到产物交付，展示名称变化不影响执行。

## 原配置页与动态选项

资源依赖可以声明 `configurationProjection: { provider, fields }`，把原插件字段路径映射到资源配置路径。插件页面显示原字段和标准眼睛按钮，保存/清空直接更新资源；Worker 只收到剩余业务值和资源 ID/协议/方法，不收到凭据。未绑定时创建独立实例；改绑已有实例时，未编辑的旧凭据不会覆盖新连接。

`options` 声明字段、只读资源方法、参数来自哪些业务字段、一次性 refreshField 和可选 refreshIntervalMs。加载、保存、启用、发布及资源侧修改触发刷新；Comfy 文件选项每60秒刷新。失败保留最后成功列表及当前选择，不改写包内 schema，不自动把失效选择换成第一项。停用插件停止其刷新。

## SDK 与持久操作

`resource(context, alias).capability(method)` 返回已绑定方法的能力 ID；`call(method, parameters, { key?, timeoutMs?, publishFiles? })` 通过限定 RPC 调用。稳定 key 用于有回执的模型补图请求：成功结果可重读；未确认写请求不能自动重做。

操作/Hook 的资源动作使用 `resource:alias/method`，grants 使用 `resource:alias`。`resourceTimeout` 允许后台操作采用资源声明的等待预算。Comfy 的0等待预算表示不额外加总时限；插件仍实现原单图轮询和批次连续120秒无新结果的超时规则。

`context.invocation.job` 和 `phase` 是宿主生成的操作身份和阶段。`state.read/state.compare` 支持 scope、instance、operation；operation 自动隔离到当前 Job/revision。`volatile:true` 在宿主内存保存，进程重启、重新发布、停用再启用或配置页保存后重置。插件通过明确声明的 `mutableConfigurationPaths` 调用 `configuration.patch`，只更新自己的业务路径；该操作不模拟插件重载。

后台 pending 可带稳定 key 的 progress 消息。结果 messages 保留文字和图片顺序；format=forward 保留原节点组织，不支持转发的通道在发送前降级。每段有真实 Outbox 回执，已发送或未知段不会重发。部分已发送后不能退回完整原文。取消和权限在每段发送前重查。

`toolWaitWhen` 配置单图工具等待实际完成；`toolWaitForCheckpoint` 使批次工具在真实提交检查点返回。`ownsDelivery` 交给 Job 交付，不依赖主 Agent 继续运行。`commandResponse:silent` 避免额外的框架接纳消息。

`model.assistant-text@1` 只变换传给模型的 assistant 文本，保留用户消息、工具结构和原始审计。`DeliveryView.originalText` 保留文字变换前内容，`invokedCapabilities` 由宿主记录本轮接纳的工具，用于防止工具和标签重复触发。

## 配置与状态迁移

插件工作区 `scripts/plan-resource-port.ts` 生成0600的候选和原配置副本、工作流/sidecar校验清单，不应用生产。所有无法确定的旧模板 ID、群 scope、管理员映射明确列为待审阅。

控制台公开 `/api/plugins/:id/state/read` 与 `/state/import`，仅导入已停用实例的明确 scope/instance/key。导入用版本 CAS；插件自身的 HTTP 请求标记会被控制台入口拒绝。`scripts/import-plugin-state.ts` 先导出备份，再按显式 `--apply` 写入；回滚核对版本及预期摘要，不重放未知请求。GSVI使用 `gsvi.policy`；Comfy的 `comfy.defaults` 保留原 group_policies，`comfy.lexicon` 保留自定义分类词库。

框架的文件、RPC、并发和平台媒体额度仍有效；超额明确失败或以完整文档产物交付，不悄悄截断业务目录。源码和合成后端验证不代表真实 GPU、GSVI 或 QQ 服务验收。
