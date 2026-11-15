# 异步能力、同群并发与 pi-durable 方案

状态：本文保留 2026-11-09 的设计和源码核验依据。第三阶段 A 已落地 durable、合批、主对话/后台任务并发及结果交付；最新完成范围与尚未接入的协议见 [阶段交付记录](implementation.md)。下文“当前实现”的问题描述指切换前的基线。

结论：一个群的逻辑会话可以同时处理多个任务。建议用 **群主对话 + 有界请求合批 + 后台任务/子 conversation**，主对话保持单个活动推理 run，后台工作并行。优先验证官方 @earendil-works/pi-durable 作为持久运行底座。

当前产品定义：**同一个群共享一份 user 状态与主 conversation。** 群员的昵称、平台标识和发言是这份输入中的来源信息，不分别拥有 Agent user 状态、Persona、长期记忆或偏好。下文的 requestId/jobId 用于追踪工作，不用于拆分群员会话。

该规则同样适用于私聊与 WebChat 的会话窗口。共享上下文不合并触发人的权限；具体绑定与监控证据见 [会话范围与触发人权限](conversation-scope.md)。

## 1. 当前实现和 SDK 的约束

- 目前 Coordinator 按 roomId 串接 Promise，任务结束后才执行同群下一个任务。全局并发数不改变同群串行。
- 当前 pi-coding-agent 1.5.0 的同一个 AgentSession 正在运行时，prompt 要么拒绝，要么通过 steer/followUp 排队，不提供两个独立 run 同时修改该对象。
- 当前 sessionKey 决定 Pi session 目录，但沙盒仍按 room.id 绑定。只改 sessionKey 不能隔离并发脚本和取消。
- 当前取消会中断执行用户进程并停止整个群沙盒。允许同群并行前，必须拆清执行资源与取消作用域。

本轮用假模型验证了当前 coding-agent 公共 forkFrom 接口：同一已提交背景可派生两个独立 session 文件，模型请求峰值为 2，快分支在慢分支释放前完成，基础文件未变，分支没有串写。该实验不调用真实模型/QQ/沙盒，也不等于正式 Bot 已支持同群并发，更不是 pi-durable 的运行验收。

## 2. pi-durable 与当前 SDK 的关系

核对对象为 Pi 同仓库的 **@earendil-works/pi-durable 1.5.0**，不是同名第三方项目。它提供自己的 Harness、Conversation、Task、Document 和 Extension API，基于 pi-ai 与 Chord；当前项目使用的 AgentSession 则来自 pi-coding-agent。

这意味着接入应实现一个运行时适配层，迁移 Provider、工具、沙盒和事件连接，而不是把 durable 当成现有 AgentSession 的一个开关。不要在外面另跑一套循环，同时让两个运行时管理同一 transcript。

可以直接复用的机制：

| durable 能力 | 用途 |
| --- | --- |
| 不可变 conversation entries、原子 commit、typed documents | 对话、请求归属和任务元数据 |
| requestId / Submission | 重连、重启后的幂等输入接纳与结果关联 |
| defineTask、checkpoint、sleepUntil、resume | 生图轮询、视频流程、定时等待和恢复 |
| conversation 创建/fork、task ownership | 独立子任务上下文及任务树 |
| background task boundary | 后台工作不把 root 保持为 busy |
| inbox、followUpMode、steeringMode | 运行中输入的边界处理 |
| replay: safe/unsafe、嵌套调用记录 | 中断后的重试与副作用处理基础 |
| env factory / ExecutionEnv | 按 conversation/任务选择 Shipyard 环境 |
| deferred tools、tool_search、usage/telemetry | 收纳、按需加载和观测的复用入口 |

包明确标记 Experimental，API 可能变化。版本应锁定，变化隔离在适配层。README 说明 portable 存储核心可用于 Bun，但需要异步 SqliteDatabase facade；Node SQLite adapter 不是已经验证可直接用于当前 Bun 部署的结论。

## 3. Root conversation 的正确职责

~~~mermaid
flowchart TD
  MSG["群消息与 @ 请求"] --> INBOX["共享 user 输入：发言记录、关联、修订与合批"]
  INBOX --> ROOT["该群的 root conversation<br/>短答、澄清、派工"]
  ROOT --> ANSWER["按 requestId 交付短答与受理回执"]
  ROOT --> JOB["后台 Job"]
  ROOT --> CHILD["后台子 conversation"]
  JOB --> DONE["结果、产物、完成事件"]
  CHILD --> DONE
  DONE --> DIRECT["可直接交付的结果"]
  DONE --> REPORT["精简报告 / 必要时回到 root"]
  REPORT --> INBOX
~~~

root 保留群内公共对话、必要事实、任务摘要与结果引用。子 conversation 按工作任务隔离搜索过程、代码、长工具返回、失败重试和推演细节；通常只回传摘要、产物引用、来源和状态，需要时再按 jobId 查询详情。不同群员发言不会因此创建不同 root。

例如一批输入可以是同一个 user 消息中的有序列表：

~~~json
{
  "groupId": "test-group",
  "messages": [
    { "messageId": "m1", "speakerId": "1001", "nickname": "小明", "text": "今天星期几？" },
    { "messageId": "m2", "speakerId": "1002", "nickname": "小红", "text": "画一只猫" },
    { "messageId": "m3", "speakerId": "1003", "nickname": "小王", "text": "给那只猫加顶帽子" }
  ]
}
~~~

root 可以直接回答 m1，并把 m2/m3 共同关联到一个戴帽子的猫的任务。一个任务可来自多条、多个成员的发言；一条发言也可提出多个工作项。来源关联不等于成员私有任务所有权。

创建 child 与 fork 不同：durable 的 task-owned child 继承 agent 配置，不自动复制主对话全文；fork 才继承指定位置之前的 transcript。按任务传入必要上下文通常更省 token。

每个群有自己的主 conversation；平台话题仅在显式配置为独立会话时另行映射，当前默认是全群共享。Harness.root() 是该 storage 的唯一 root，不能让全 Bot 的 QQ/TG 群共用它。可用一个 Harness 管理多个独立群 conversation，并在 Bot 层维护地址映射；或者按群拆 Harness/storage。一个 storage 只有一个写入进程，官方没有提供跨进程写锁。

普通新话题默认进入下一批；明确补充同一任务的发言可以形成修订或 steer，无论由哪个群员提出。关联依据是引用和语义，不由“是不是同一个人”决定。已经提交给外部服务的工作仍按其取消/修改协议处理。

## 4. 必须采用后台模式的 subagent

官方示例区分：

- 21-subagent-foreground：工具等待子 conversation 的答案，父会话仍 busy。
- 22-subagent-background：background anchor 持有 child，后台 reporter 等待结果；spawn 工具很快返回，root 可以继续回答用户。

本项目应参考第二种。仅增加一个会 await 子任务的 subagent 工具，仍然会出现任务 0 阻塞后续消息。

示例还需要按 IM 场景调整：

1. child 的身份绑定工作任务 requestId/jobId；角色名和发起者都不作为唯一会话键。独立的绘图/研究工作可分开运行，同一工作中来自不同群员的补充仍关联同一任务。
2. spawn 只在任务成功持久化后返回受理状态。排队就说已排队，不能把它描述为外部服务已经开始执行。
3. reporter 默认产生结构化完成事件，不把子任务全文无条件提交到 root。
4. 简单成品可直接交付并向 root 写入精简事实；确实需要结合当前对话解释时才触发 root 新轮次。
5. reporter 必须核对 request revision、取消状态、会话 epoch 和交付目标。官方示例允许 Esc 之后迟到的报告再启动主会话，这不应直接变成 Bot 默认行为。
6. 限定子任务递归和总预算。durable 的 maxTurns 是单个 run 的上限，反复 continue/回流会开启新 run，不能把它当整个请求树的总预算。

durable 的 background 边界影响 abort 和 idle wait：普通 root.abort() 不会取消边界后的后台工作，显式 background:true 才会越过。Bot 的群行为规则决定停止指定任务、当前工作或全群工作；不默认用发言者 ID 将范围缩成一份个人 user 状态。

## 5. 统一异步协议

异步是内置基建能力。插件、MCP 适配、指令和子 Agent 使用同一协议，不各自维护没有登记的后台 Promise。

Operation 描述执行类型、可恢复性、取消能力、外部幂等性和资源需求。调用结果统一为：

~~~text
ready    { requestId, result, artifacts }
accepted { requestId, jobId, state: queued | running }
failed   { requestId, error }
~~~

Job 至少保存：

~~~text
jobId / requestId / requestRevision / batchId
sharedUserId / room / topic / conversationEpoch
sourceMessages[] { messageId, speakerId, nickname }
triggerIdentityRefs / authorizationContext
operation / inputs / selected resources / config revision
parentTask / childConversation / externalTaskId
state / checkpoint / deadlines / cancel capability
artifacts / result summary / delivery state
~~~

状态区分 accepted、queued、running、waiting_external、waiting_input、succeeded、failed、cancel_requested、cancelled、interrupted、outcome_unknown。取消请求被接收不代表上游已经取消。

实现方式：

- 生图/视频等已有外部任务接口：提交、保存 externalTaskId、轮询或等待回调、登记产物。
- 固定的视频总结流程：采集/转码/识别/模型总结等步骤组成 Job，不必每项都启动子 Agent。
- 需要自主搜索、反复工具调用和规划的工作：创建子 conversation，仍由 Job 服务管理用户可见状态。

外部发送/生成不自动获得 exactly-once。模型重试、任务恢复、用户重新请求分别处理；外部提交结果未知时先核对，不重新生成一遍。副作用工具不能随意标为 replay:safe。

不能用 Promise.race 超时后再启动另一份相同工作作为“转后台”。长操作应从入口交给任务服务；已运行的任意函数只能在支持的检查点继续，不能假定可透明迁移。

## 6. 同群“并发 2”如何定义

建议第一版为：

- 主 conversation 的活动 run：1。
- 后台推理 run：1。
- 所以同群可同时有 2 个 Agent 推理任务，root 对话和后台工作并行。
- 外部 Job 并发、GPU/API 限额和模型 HTTP 并发单独控制。后台等待图片并不一直占模型请求槽。

如果要后台同时跑两个 Agent，就是 root 1 + child 2，共 3 个活动推理 run；不能把它仍称作总并发 2。UI 应区分“推理并发”“后台任务并发”“外部服务并发”。

资源调度给前台保留容量；两个后台长任务不能耗尽全部模型额度。若上游实际上只允许一个请求，或者只有一个不可并行资源，调度不能凭空提供第二份能力。

durable 的 toolExecution:parallel 控制一轮内工具的执行方式，不是本设计的同群任务并发上限。

也可以用两个独立前台 conversation/fork 回答两个互不依赖的请求，但它们看不到对方尚未提交的结果，需要更多一致性规则。当前场景优先采用 root 短轮次 + 后台并行。

## 7. 有上限的滑动窗口合批

一次合批将同群发言作为同一个 user 的有序消息集合。原始消息、待处理工作项和 Job 分别关联；内部 Request 用于追踪回答和执行状态，不表示每个群员都有独立 user。

建议起点（待 Mock 与真实延迟测量后调整）：

~~~text
quietWindowMs: 600
maxHoldMs: 2000
maxRequests: 6
maxInputTokens: 2500
~~~

窗口结束为 min(最后一条合格输入 + quietWindow，首条输入 + maxHold)。数量/预算到上限提前封口，避免活跃群不断延后发送。

- 同一群采用共享的 Persona、模型与资源配置；窗口跨越明确的配置/会话切换时再分批，不因成员不同而分批。
- 权限不同的消息可以共同进入上下文，但批次不能合并获得更高权限；普通自动执行使用共同允许的能力，受限动作绑定明确的触发输入独立鉴权。
- 每条发言保留 messageId、speakerId、nickname、引用与顺序；工作项另外保存关联消息和 revision。普通群流水是背景，不因此变成必须回答的问题。
- /stop、配置指令和明确交互回复走控制路径，不等待批处理窗口。
- 不同成员可以共同补充一个工作项。相同文本是否为重复、赞同或独立请求由上下文判断；平台重复上报按 messageId 去重。
- 已送入模型的批次不再修改。后续消息进入下一批，只有明确属于同一工作且可安全处理的补充才 steer。
- 限制群内待处理队列长度，并合并相关补充、处理取消或被替代的工作项，避免无限积压后全部补答。成员限频如有需要属于群行为规则，不引入按成员分别维护的 Agent 队列。

前台每个 Request 必须得到一种处置：answered、delegated(jobId)、needs_input 或明确失败。快问题可在一条回复中逐项 @/标注回答；长问题关联其后台任务。

“一个批次”不保证恰好一个模型 HTTP 请求：Pi 工具循环可能有多轮。但不需要为每条消息再调用一个分类模型；已知长能力可按描述直接派工，其余由同一前台轮次判断。

durable 的 followUpMode:all 可以合并已排队输入，但没有提供“等 600ms 收集一批”的完整 IM 策略。Bot 仍需窗口、数量/token 上限和归属记录。避免同时让 Bot 合批和 runtime 无界合并形成超大请求。

## 8. 结果回流与防止连珠炮

以 A、B 的短问答和 C 的视频总结为例：

1. 同一窗口收集 A/B/C。
2. root 输出 A/B 的回答，并为 C 创建 Job，合并发送“回答 + C 已受理”。
3. C 在后台运行；D 的新问题进入下一前台批次，无需等视频总结。
4. C 完成后，引用或标注原请求单独交付，必要时进入受控 root 汇总。

还需要以下交付规则：

- 发送队列只接收已准备好的内容，不能让任务 0 的未来结果占住整个群的发送序号。
- 仅保持单个逻辑回复及明确依赖的顺序；独立任务可按完成顺序交付。
- 受理通知合并，进度限频/去重，短时间多个已完成结果可合并展示。成功结果不能因限流被静默丢弃。
- 同一个 request/result 的重复完成事件不能重复发；发送结果未知与计算失败分开，不能重跑计算弥补发送故障。
- 无关新消息不会让旧 Job 失效。只核对相关请求 revision、输入资产版本和权限；否则活跃群会使所有长任务永远过期。
- 用户改了问题、取消或新开会话后，旧结果按策略保存为可查询产物或标明旧版本，不自动当作当前答案。

这比单纯扩大并发数更直接地解决“堵住后连珠炮”。

## 9. 共享状态、文件与取消

群状态、人格、记忆、偏好和资源绑定共享。speakerId/nickname 用于理解“谁说了什么”、引用、@、审计和可选的管理员规则，不用来选择另一份 Agent user 状态。

工具执行保留独立的触发身份与授权上下文，不从群的“最近发言者”或模型自报的 actorId 推导。混合批次中的管理员发言不自动授权其他成员的动作；后台/子 Agent 继承原执行依据，并在实际操作时检查有效权限。

任务修改和取消依据引用/任务 ID/对话语义定位目标。是否限制某类操作由群行为规则决定，不默认把每个 Job 锁定给发起成员。存在两个可指向的任务时要消除歧义；明确只取消一个任务，不应连带丢失其他工作项。

现有 Shipyard 按群共享并整体停止，尚不满足独立任务取消：

- 独立脚本任务可分配独立执行租约/沙盒；共享持久数据另行加写租约或版本化提交。
- 资源受限时，LLM 和纯读取/外部服务仍可并发，而共享可写工作区保持排他。这是资源约束，不该阻塞整个群的问答。
- 仅换一个 cwd 子目录不能隔离自由 Shell，也不能使停止整个容器只影响一个任务。
- 不允许普通桌面 subagent 扩展直接启动宿主 pi 进程并使用默认本地工具。

durable 的 env factory 按 conversationId 提供 ExecutionEnv，可以适配现有 Shipyard，但要覆盖 root 与全部 child。取消等待不等于取消工作：Submission 等待 Context 与任务 abort、远程执行 Context 分开处理。

## 10. 接入范围与下一步验证

优先做一个隔离 Mock 范围的 durable 适配，不直接切换现有正式会话。复用 durable 的 conversation、task、document、inbox 和恢复机制；Bot 保留平台事件、请求归属、批处理策略、资源限流和交付协议。

必须核验：

1. Bun + 选定 Storage facade、关闭/重开后的待办恢复；不新增数据库实现测试。
2. root 派后台任务后仍能接收下一批；root 失败后 backlog 策略不会永久搁置，也不会快速失败刷屏。官方 afterFailedRun 默认 keep 需要明确选择。
3. 共享 user 的多人发言合批、跨成员补充、任务关联与取消、混合权限不提升、后台身份不随新发言变化、未回答项与迟到结果。
4. Provider 自定义 headers/body、候选 fallback、部分流失败不提交工具副作用，使用当前真实配置可运行。
5. root/child 全部使用远程 env，单任务取消不终止另一任务。
6. 发送之后崩溃、完成事件重复、旧 epoch 报告等情形不会盲目重发。
7. 配置/注册版本：durable 在每次使用时解析某些设置，cwd/extension 变更能影响已发出的工具调用；Bot 的任务快照约定需要额外固定。

资料：

- [官方 durable README](https://github.com/earendil-works/pi/blob/6e2222a8dda06e3d69fad46d630f152f5873567a/packages/durable/README.md)
- [后台子 Agent 示例 22](https://github.com/earendil-works/pi/blob/6e2222a8dda06e3d69fad46d630f152f5873567a/packages/durable/test/examples/22-subagent-background.ts)
- [前台子 Agent 示例 21](https://github.com/earendil-works/pi/blob/6e2222a8dda06e3d69fad46d630f152f5873567a/packages/durable/test/examples/21-subagent-foreground.ts)
- npm 元数据核对：@earendil-works/pi-durable 1.5.0，声明 Node >=22.19.0；portable core 的 Bun 适配说明见 README Storage。
