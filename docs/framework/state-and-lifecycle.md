# 状态、任务、交付与插件生命周期

状态：状态机制及后续扩展参考。2026-11-09 的 [实际基线](runtime-baseline-2026-11-09.md) 已确认后台子 Agent、Cron、图像结果回流属于当前需求；HAPI、PriceAI、绘画经验等场景属于未来扩展，不作为当前 MVP 的强制门槛。本文不是要求先建设一个覆盖全部已安装插件的通用工作流平台。

后续实现优先复用官方 pi-durable 的任务和持久状态机制。[异步与同群并发方案](async-and-concurrency.md) 明确了 root/child、合批、取消和结果回流；本文件描述所需语义，不要求自己重新实现所有基础设施。

## 1. 统一调用上下文

InvocationContext 由核心创建，跨 RPC 显式传递：

~~~text
invocationId / parentInvocationId / traceId / causationId
actor / account / channel / chat / thread
conversationId / conversationEpoch / sessionKey
origin: im | command | cron | webhook | subscription | tool | subagent | admin
profileRevision / personaRevision / registryRevision / pluginGeneration
deadline / cancellation / resourceBudget / modelBudget
workspaceLease / artifactGrants / deliveryTargets
~~~

不能只传 roomId 或一个可变 event。后台任务保存可序列化的地址、来源和配置快照，不保存活的事件对象或框架 Context 引用。

群聊中 actor 是发言来源，不是独立的 Agent user 状态。群共享 Persona、记忆、偏好和主 conversation；task ownership 描述任务树的生命周期归属，不等于按成员划分私有会话。一个工作项允许关联多个成员的发言。

actor 还可作为工具鉴权依据。授权上下文绑定本轮/任务并由子任务继承，不能保存在群的可变“当前用户”字段中。共享的工具配置不等于每个触发人都有相同调用权限，详见 [会话范围](conversation-scope.md)。

pluginId/权限来自已绑定的 Worker 身份，不采信插件自报。不同用途的模型调用带 purpose，例如 chat、vision、summary、embedding、review；不同输出带 phase，例如 progress、intermediate、final、tool-direct、notification、control。

同一插件多实例可绑定不同服务账号与 profile。默认无需每个聊天都常驻一个 Worker；逻辑数据按 scope 隔离，含互不信任凭据的实例再分进程/容器。

## 2. 持久对象与所有权

| 对象 | 拥有者 | 可共享方式 |
| --- | --- | --- |
| 消息/事件原始记录 | Channel + Event Store | 按授权 scope 查询，标明原生 ID、本地 ID 和覆盖范围 |
| Conversation 与 Pi session | Conversation Service / Pi Bridge | 切换、分支、追加和投影 API；单写者 |
| Persona 与配置绑定 | Profile / Persona Service | 版本、继承、原子修改、来源追踪 |
| 插件私有数据 | plugin instance | 独立 KV/blob、数据卷或外部库；其他插件通过领域服务访问 |
| 产物 | Artifact Service + 创建者 | 显式 artifact grant、引用计数、保留策略 |
| 作业和等待用户的交互 | Job / Interaction Service | 状态机、owner、幂等键、取消和恢复 |
| 平台动作与真实回执 | Delivery / Channel Service | 交付意图、分部回执、后续平台通知 |
| 模型选择与用量 | Model Gateway | 只暴露引用/元数据，凭据独立管理 |

消息的“未观察到”“平台不支持回溯”“已删除”必须能区分。例如 Enishi 的 QQ 远程历史与 TG 本地历史不能返回相同的完整性承诺。

存储介质不必统一：领域插件可使用适合自己的向量库、图数据库、文件或远端服务。命名空间与所有权统一，避免共享数据库连接和任意修改别的插件表。

Artifact 保存生产者、来源消息/任务、MIME、大小、摘要和有效期。原生 QQ/TG 媒体引用、下载后的文件、生成产物是不同对象；沙盒路径不是跨插件稳定 API。临时像素投影不因为进入一次模型请求就永久写进历史。

## 3. 持久任务与交互

Job 的基本状态为：

~~~text
queued → running → waiting_external / waiting_input → running
       → succeeded / failed / cancelled / interrupted / outcome_unknown
~~~

同一 Operation 可同步返回结果，也可返回 jobId。长视频、生图轮询、直播窗口采样、群日报、RAG 建库不应长时间占用一个消息 handler。

- Job 保存外部 taskId、步骤状态、配置/插件版本、取消方式与恢复规则。
- HTTP 提交失败但结果不确定时，不盲目再创建一个生图任务；优先按幂等键/外部 ID 查询。
- 重启时只恢复有明确恢复协议的等待/轮询步骤，不重放整段有副作用的脚本。
- 用户等待是持久 Interaction，不是把一个 Python Future/JS Promise 留在内存中等数分钟。
- 普通用户输入继续归档；只有匹配该 Interaction 的输入才恢复它。HAPI 专注模式是带范围和期限的输入归属。
- 确认记录绑定群 scope、待办版本及原始发言；来源 ID 留作审计，并按该动作的群规则判断是否满足确认条件，不因此拆分成员 user 状态。绘画保存等操作不能只信任模型传来的“用户已同意”布尔值。
- 明确的“保存这张图”可直接产生授权动作，不要求先走一遍重复的询问流程。

子 Agent 属于任务树，有独立 Persona、工具集合、会话与预算。同步子任务限于短且有界的调用；后台子任务返回 jobId，完成后按配置直接交付或唤醒父 Agent。父/子哪一方负责最终发送必须明确，避免两份回复。

HAPI 是外部会话应用：专注模式可把消息直接交给远端会话，不必绕一次 Pi。退出专注、批准、取消等控制入口始终可达。

## 4. 互不阻塞的调度

拆开以下资源，不用一个“会话锁”包住全部工作：

- Pi transcript 的单写者与会话代际。
- 同时进行的模型 HTTP 请求数量。
- 每个插件 Worker、每个领域服务端点的并发与排队额度。
- GPU/ComfyUI、浏览器 profile、外部 API 配额等具名资源。
- 平台账号的发送速率和同一逻辑回复的顺序。
- 持久 Job、通知订阅者和等待用户交互的队列。

等待外部 Job/人工回复的流程应在安全边界提交 pending 引用并停放，不占着一个正在执行的模型槽位。若 Pi 内部仍有未完成工具调用，先返回明确的 pending 工具结果；不能释放写锁后让别的任务往同一半完成 transcript 中写入。

核心控制指令不排在业务长队后面。插件 A 卡住时，只触发它的 timeout/circuit breaker；插件 B、其他会话和工作台仍可用。普通异步函数无法中断 CPU 死循环，因此第三方处理器与自定义正则匹配不能直接在核心事件循环无限执行。

跨插件调用形成调用链，继承 deadline、预算和取消，不重置为新预算。禁止持有共享资源写锁再等待另一个拥有者回调自己；使用短事务、快照和提交版本检查。递归调用与事件自激要有来源标记、深度和扇出上限。

停止 Worker 可能影响该插件实例内的其他任务；这是该实例的故障域，应在配置中可见。不能为了终止一个插件而停止共用浏览器、全部 GPU 任务或其他插件的沙盒。

现有 ComfyUI、共享浏览器、图像搜索、直播感知等服务通过具名 connector 和资源租约复用。插件释放自己的任务、页面和产物；不掌握整个共享服务的任意生命周期。

## 5. 交付是独立的状态机

业务结果、模型可读的工具返回和平台交付意图分开：

~~~text
DomainResult / AgentOutput
  → DeliveryIntent（目标、来源、阶段、产物、幂等键）
  → visibility / text transforms / presentation
  → adapter conversion / native payload transforms
  → sealed Outbox entry
  → sending
  → delivered / partially_delivered / failed / outcome_unknown
  → receipt subscribers
~~~

允许多种目标：当前群、私聊、订阅者集合、运维通知接收人。目标范围由操作上下文和插件配置授权，不能把所有插件能力硬限制为“只能回当前群”；tattle、biliVideo 和 PriceAI 都需要主动或跨目标通知。

Operation 的调用方可以等待真实回执，也可以订阅完成事件。后台订阅者不用占着 Agent 等平台 ACK。不同平台的回复、转发、媒体、群文件上传、编辑、撤回和回调按钮都要有能力描述与原生操作扩展。

提供 platform.invoke 等原生操作入口时，已知发送/编辑/撤回方法仍转入相应动作服务。未知原生副作用明确标记为 opaque，不能伪装成普通可重试查询。

Outbox 记录逻辑 replyId、deliveryId、各组成部分与平台 ID。一个结果可能发多条消息、部分成功；最终回复与工具有意直发可以并存，不能只保留一段 finalText。

后续策略：

- final_only 过滤 intermediate/progress 等指定阶段，保留工具直发产物和控制消息。
- TTS 读取最终语义文本并产生音频呈现；不覆盖模型历史。失败回退策略按 profile 指定。
- TIM 修复在 OneBot 原生转发负载阶段执行，早于实际提交、回执晚于实际发送。
- 批量撤回使用成功回执的平台 ID；编号列表绑定用户看到的列表版本，后续新消息不改变这份编号。API 接受撤回与收到撤回通知是两个状态。
- PriceAI 对应外部消息只在交付事实满足策略后 ACK。进程在发送后、ACK 前崩溃时，用 inbox/outbox 关联恢复；平台不支持幂等时仍可能出现 unknown，不能保证通用 exactly-once。

进度消息可以合并/限流；控制消息可有独立紧急通道。队列 QoS、消息顺序和 hook 优先级分别配置，避免一个优先级数字承担所有意义。

## 6. 插件安装、配置与热更新

生命周期：

~~~text
discovered → validated → staged → active → draining → stopped
                                      ↘ failed / quarantined
~~~

manifest 至少声明 ID、版本、SDK/API 范围、贡献项、服务依赖、运行方式、配置 schema、数据 schema 和资源需求。安装与构建在任务专用环境完成，插件依赖不覆盖 Bot 自身依赖。

激活前编译 registry/profile：检查命名冲突、缺失依赖、扩展点版本、独占槽和顺序环路。应用一个完整版本，不在进行到一半时发布半套工具。

每个已接受任务持有 plugin generation 租约。升级先让新任务转到新版本，旧版本排空在途工作。提交/等待分开的 ComfyUI 任务必须保留原客户端与配置快照，这可以直接借鉴 channel_generation_profiles 的做法。

卸载注销该 generation 的工具、命令、hooks、订阅者、页面、计时器和资源租约；不得删除其他插件注册项。超时强制退出要留下未决任务清单。代码回滚与数据 schema 回滚分别管理，升级前备份自己的数据。

配置支持全局和 scope 覆盖、secret 引用、版本检查、原子保存、验证与变更事件。只读配置快照传给每次调用；插件私有写入和公共配置修改各有入口。

插件页面挂到命名空间，采用隔离 frame/来源和受限 API 桥接，不把第三方脚本直接导入管理页全局。简单配置页从 schema 生成，复杂页面仍可自主实现。后台路由同样不能覆盖核心 API。

无需把所有现有 Python 插件移植成新的兼容宿主。已有外部服务可继续复用；需要移植的逻辑按 Operation/资源契约迁移，减少同时维护两套框架语义。

## 7. 观察与调试

运行轨迹区分事件、Invocation、模型 attempt、工具/子任务、Job、交互和交付，而不把一切都叫“一轮 LLM”。

核心记录关键状态和用量事实；插件监控消费副本。慢监控不能阻断发送。高体积调试日志允许限流并报告丢弃数量，关键任务/交付状态不能当普通日志丢弃。

用量聚合覆盖主 Agent、插件辅助模型和子 Agent。工具目录、Skill 元信息按需投影；调度、优先级、回执等确定性控制不额外调用 LLM。实际 token/延迟增量需在相同任务集上测量，不按插件数量估算。

错误必须定位到具体 owner、stage 和 revision。插件自行建立、绕过网关的 HTTP/模型调用标注观测缺口，不能声称 Monitor 覆盖了全部成本。

## 验收矩阵

当前优先验证能力目录、搜索、沙盒、图片、后台子 Agent 与 Cron 交付。下表同时保留后续扩展参考；带 HAPI、PriceAI、绘画确认的用例待相应能力实际启用后再纳入。可用 Mock、假模型/服务和故障注入验证，不需要给数据库实现新增测试。

| 场景 | 验收行为 |
| --- | --- |
| 选定或切换工具收纳策略 | 同一有效配置只有一个实现工作；会话状态隔离，切换在明确轮次边界生效 |
| 群流水与上下文投影并用，LLM 聊天被关闭 | 已授权流水继续记录；不重复注入；控制指令仍工作 |
| 两个群同时选择不同模型/Comfy 工作流 | 请求配置与排队任务均不串用；结果等待使用原提交快照 |
| 生图任务运行时升级插件、切换 profile | 老任务用旧 generation 收尾，新任务使用新配置 |
| 绘画保存建议与 HAPI 审批同时待确认 | 根据引用/交互 ID/用户区分，不把一个“确认”发给两个插件 |
| HAPI 专注接管中收到 /stop 或退出命令 | 控制入口即时处理，归档/监控不被 stop_event 一起截断 |
| 群分析读取长历史、并行生漫画、导出群文件 | 预算、子任务、产物引用、进度与最终交付可追踪且可取消 |
| PriceAI 收到重复事件，发送后进程崩溃 | 恢复 inbox/outbox 关联；成功、unknown 与 ACK 状态准确 |
| 工具直发图片、Agent 最终文本、TTS、TIM、撤回共存 | 所有实际交付均有来源与回执；中间文本过滤不误杀产物 |
| 用户切换 Persona 时旧任务尚在运行 | 旧任务使用固定版本，新轮使用新版本；不改旧历史 |
| 插件 CPU 死循环、异常、返回超大消息 | 该故障域可终止；其他插件、会话和控制面可继续 |
| 插件 A 调用 B，B 尝试回调 A | 不无限持锁等待；给出明确的依赖/重入/超时结果 |
| 自定义 hook 参数修改后不再符合 schema | 执行前拒绝，不能靠 Pi 早先校验过就放行 |
| 模型失败触发 provider fallback | 只重试该模型请求，不重放已完成的保存/发送/生成任务 |
| 插件卸载时仍有定时器、浏览器页面、订阅 | 仅释放自身租约，保留可恢复状态与未决任务记录 |
| 调整优先级形成环路或重复命令别名 | 预览失败，旧配置继续有效，UI 能解释冲突 |
