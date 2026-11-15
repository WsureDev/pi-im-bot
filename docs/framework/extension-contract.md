# 扩展点、优先级与共享资源协议

状态：后续扩展协议参考，2026-11-09 已调整范围。当前优先实现 [框架设计](README.md) 中的数据加工、偏好、行为与内置基建；这里不要求把每个内置设置都变成插件钩子，也不要求 MVP 一次性实现全部模式。

当前已实现六个核心切入点、持久观察与跨插件 operation RPC，实际接口见 [第四阶段 C](plugin-pipeline.md)。本页其余扩展点、around、自定义 point 运行和通用重放仍属于后续设计。

工具收纳是单选策略。当前 Enishi 启用、Lazy Tools 关闭，不存在需要设计为常态的双策略竞争；多个工具来源可以汇集，但最终暴露/收纳由一个选定实现负责。

## 扩展点不是同一种回调

每个扩展点由一个所有者定义输入/输出 schema、调用时机、支持模式和可写字段；插件注册 handlerId、适用范围、默认优先级、依赖与运行策略。核心扩展点归核心服务所有，插件可注册自己的版本化扩展点。

| 模式 | 合并语义 | 典型用途 |
| --- | --- | --- |
| collect | 多个独立贡献并行计算，按稳定顺序归并；不修改原对象 | 人物背景、RAG、成员信息、工具候选 |
| transform | 按确定顺序处理前一步产物；每次返回新产物或受限 patch | 文本清理、媒体呈现、平台负载修复 |
| select / claim | 按优先级选择匹配者或唯一处理者 | Persona/路由选择、HAPI focus、链接自动解析 |
| policy | 产生 allow/deny/constraints，由固定规则合并 | 群 LLM 开关、权限、预算、工具可用性 |
| exclusive | 一个 profile/slot 仅允许一个主策略 | 工具暴露策略、主上下文投影器、会话执行后端 |
| around | 在明确支持的服务点包围一次受控调用；进入正序、退出逆序 | 资源租约、调用上下文、兼容包装、finally 清理 |
| observe | 异步消费已提交事实，无权改变已发生的动作 | 用量监控、撤回计划、消息归档、外部 ACK |

优先级是顺序，不是权限、token 重要程度或跨阶段抢占权。三者分别建模。

## 建议公开的切入点

| 位置 | 模式 | 关键规则 | 对应现有能力 |
| --- | --- | --- | --- |
| ingress.normalize | transform | 统一事件 + 原生 payload 引用，保留来源 ID | QQ/TG 通知、引用、戳一戳、小程序 |
| message.recorded | observe | 已获准采集的渠道先记录；后续接管不能抹掉事实 | 群流水、画像、群分析 |
| interaction.route | select/claim | 明确 owner、actor、scope、TTL；冲突要可见 | HAPI 专注、审批、Skill 安装确认 |
| command.resolve | select | 参数 schema、别名、角色和 scope；原文不被覆盖 | 内置管理、业务指令、正则入口 |
| invocation.admit | policy | 区分 record/command/agent/job/delivery 的允许范围 | group_llm_guard、配额、黑白名单 |
| profile.resolve / persona.select | collect + select | 字段级来源与最终选择，无全局可变“当前配置” | 人格、模型、渠道生图配置 |
| context.collect | collect | 片段有来源、有效期、用途、去重键、预算权重 | 用户画像、RAG、群流水、视觉转述 |
| context.project | exclusive + transform | 不破坏 tool-call/result 配对；投影不等于历史改写 | Enishi、媒体/工具结果收纳 |
| tools.expose / skills.expose | 单选策略 + 资源候选汇集 | 授权与暴露分开；当前只迁移选定收纳实现；加载不扩大权限 | 当前 Enishi、MCP/Skill 资源 |
| model.request.prepare | transform/policy | model 业务目的明确；工具/会话协议字段由核心维护 | 提示规则、路由、供应商参数 |
| model.attempt / model.usage | observe | 覆盖一次模型调用的所有候选尝试，不重放业务工具 | LLM Monitor、CPA |
| operation.prepare | transform/policy | 插件领域服务也经过此处；修改参数后重新校验 | 模型/工作流选择、LoRA、参考图 |
| operation.progress / operation.completed | observe | 原始结果、产物和交付意图分离 | 生图、视频、感知、子任务 |
| interaction.await / interaction.resolved | 状态机事件 | 持久相关性与一次性消费，不能阻塞会话锁 | 保存草稿、扫码登录、远程审批 |
| delivery.visibility | policy/select | 依据来源与阶段，保留有意直发的产物 | final_only、进度显示、静默策略 |
| delivery.text / delivery.presentation | transform/select | 文本编辑和音频/图片渲染分开；输出类型有约束 | 空行清理、TTS、长图、报告 |
| transport.<platform>.prepare | transform | 使用版本化原生 payload schema，仍归统一交付 | TIM 转发修复、QQ/TG 差异 |
| delivery.receipt / platform.notice | observe | 平台 ID、部分成功、unknown、后续撤回通知 | 批量撤回、可靠订阅 ACK |
| plugin.lifecycle / config.changed | observe/control | generation、排空和可撤销注册 | 动态工具、页面、热重载 |

这是一组首要扩展点，不是永远固定的白名单。领域插件可发布例如 image.generate.prepare@1、report.render@1，其他插件通过公开定义参与；不需要框架认识该领域的所有业务参数。

## 排序规则

1. 先确定 point、scope 与本轮固定的配置版本，只选匹配的 handler。
2. 检查服务依赖、schema 版本、独占槽与权限。无效组合不能激活。
3. 在同一个 point 内，对 before/after 和必需依赖进行拓扑排序。
4. 对当前可执行的节点按有效 priority 降序排序，越大越先；同值按 pluginId、handlerId 固定排序。
5. 用户配置覆盖插件建议优先级。已声明的必需依赖不会被一个优先级数字反转，界面展示该约束。
6. 环路、缺失的必需依赖和不兼容写入在配置预览时报告；应用失败保留上一可用版本。

不同模式对排序的含义不同：transform 的较低优先级步骤可以加工较早产物；select 的第一个有效匹配获选；collect 的执行可并行、最终贡献顺序稳定；observe 的优先级只调度自己的消费队列，不能阻止发送或其他订阅者。

不采用“数字小的最后写，所以覆盖全部高优先级策略”作为通用冲突规则。每个可写字段明确一种合并方式：

- append-keyed：按命名片段追加，相同 source/key 去重。
- set-if-absent：补默认值，不覆盖显式输入。
- select-first：首个匹配的高优先级贡献成为选择结果。
- ordered-transform：显式允许后续变换读取并修改前一产物。
- conflict-error：两个拥有者争写独占字段时拒绝配置/patch。

权限约束采用核心规定的交集/拒绝语义，不能通过把某插件优先级拉高来重新放开已经拒绝的能力。业务偏好不是权限规则，允许用户显式选择冲突解决者。

around 不暴露底层对象或任意 next 函数：continuation 绑定 invocation/handler，默认只能推进一次，超时和取消由核心收尾。需要重试时提交 RetryDecision，由操作拥有者根据幂等性与预算执行，不能让包装器重复推进一次发送。只在需要包围生命周期的服务点开放该模式。

顺序图无环只能证明执行顺序可确定，不能证明业务变换兼容。扩展点拥有者还要定义不变量与组合样例；兼容声明、冲突诊断和 Mock 回放共同验证语义。

## 可审查的注册示例

以下只是协议草案，暂未接入运行时：

~~~json
{
  "point": "image.generate.prepare@1",
  "plugin": "channel-generation-profiles",
  "handler": "apply-channel-defaults",
  "mode": "transform",
  "priority": 80,
  "before": ["image-presets:expand"],
  "scope": { "channels": ["qq", "telegram"] },
  "reads": ["profile.image", "request.explicitOptions"],
  "writes": ["request.providerRef", "request.workflowRef", "request.defaults"],
  "merge": "set-if-absent",
  "timeoutMs": 1000,
  "onError": "fail",
  "acceptsOrigins": ["command", "tool", "job"]
}
~~~

profile 提供默认工作流，preset 插件展开提示，参考图解析插件生成 Artifact 引用，然后核心校验并提交图像 Job。任务记录完整的工作流/模型快照；等结果时不重新读取“当前工作流”。同一公共服务从指令和工具进入，执行相同规则。

插件 A 的 manifest 可以定义其服务及扩展点：

~~~text
image-generator
  provides: image.generate@1
  exposes:  image.generate.prepare@1
            image.generate.completed@1
  tools:    generate_image -> image.generate@1
  commands: /生图 -> image.generate@1
~~~

插件 B 依赖服务契约，不依赖 A 的类名、私有字段或文件布局。可选依赖缺失时只关闭对应 integration；必需依赖缺失时阻止该 profile 激活，并说明原因。

## 修改与副作用

每次调用传不可变 InvocationContext 和输入快照。handler 返回带 baseRevision 的 patch、贡献或决策，不获得共享 event 对象引用。框架检查写入范围、目标类型与 revision 后原子应用；过期、超时或已经取消的返回值不提交。

临时私有状态放到插件自己的 invocation namespace。需要让其他插件读取的注解，发布带 schema 和来源的 annotation；不再依靠约定几个未注册的 event.extra 字符串键沟通。

invocation 的触发身份与授权上下文独立于共享 conversation。工具在实际执行处鉴权，嵌套/MCP/子 Agent 调用不能跳过；多人合批不得将触发人的权限取并集，也不得由模型任意指定高权限发言者。

格式转换失败可以保留原输入；身份/授权错误必须停止对应动作；上下文的可选来源超时可跳过。每个点声明默认错误策略并允许有边界的配置，不能一律“异常就放行”或“一律终止全部 Bot”。

变换成功不等于外部副作用可以回滚。发送、订阅、保存知识库、启动生成任务等作为具名 Action/Operation 执行，记录 operationId、幂等键和结果。调用外部服务后网络超时要进入 unknown，不默认重试非幂等操作。

允许插件自行访问外部服务，但这部分不自动享有全局事务、重放和去重保证。插件应声明这种效果，工作台显示观测覆盖情况。框架管理的平台凭据与平台发送始终留在 Channel/Delivery 服务。

## 接管只能作用于明确分支

不提供无范围的 stop_event：

- claim(interactive-input)：本次交互交给 HAPI 等所有者，消息归档与监控继续。
- deny(agent)：关闭自动 LLM 聊天，允许控制指令和已经授权的记录。
- suppress(deliveryItem)：只禁止某个输出项，例如中间文本；不删除 Agent transcript。
- cancel(runId/jobId)：取消指定任务树，按已注册取消协议传播。

多个“确认/批准”待办同时存在时，用引用消息、交互 ID 和群会话绑定消除歧义。actor 是来源标签及可选群规则的输入，不默认建立个人会话或个人任务所有权。优先级不能代替对具体待办的选择。明确的用户指令可直接授权对应动作，不额外制造重复确认。

## Pi Bridge

以下表格是当前 pi-coding-agent 的接口参考。若采用 [pi-durable 方案](async-and-concurrency.md)，应映射到它自己的 Registry/Extension/Task/ExecutionEnv API；二者不是可直接互换的扩展系统。

依据当前安装的 @earendil-works/pi-coding-agent 1.5.0 公共接口：

| Pi 接口 | 框架接入 | 约束 |
| --- | --- | --- |
| before_agent_start | 固定 Persona、提示片段与运行配置 | 只应用框架已合并的结果 |
| context | 普通消息投影 | Pi 会恢复系统提示与工具声明，不能用它控制完整工具集合 |
| context_with_system | 完整请求投影的受控最终入口 | 拥有系统消息和工具声明，必须校验协议与授权 |
| tool_call / tool_result、customTools | Operation Gateway、结果与产物投影 | Pi 文档明确参数被 hook 修改后不再自动校验；框架需再次校验 |
| Provider/stream 回调、现有 Responses streamFunction | 请求变换、attempt/usage 观测 | 主动取消不 fallback；单次模型请求失败不重跑已完成工具 |
| compaction/session 事件与公开 session API | 压缩、切换、分支、持久记录 | 不修改 Pi 私有 runner 状态或手工重写 session 文件 |

直接使用公共 hooks 也不会自动带来插件隔离：Pi 的多个 handler 本身仍可看到前面 handler 的变更。因此只保留一个框架 Bridge，第三方的排序、所有权和冲突检查在 Bridge 之前完成。

Skill 脚本继续使用受管远程文件/Shell 操作。Codemode 和 MCP 若恢复，必须调用同一 operation/执行边界；不能因为注册了一个扩展就重新启用宿主执行旁路。

Skill 元数据由核心从固定版本资源读取；提供给模型的脚本/资源路径必须映射为真实 guest 路径。宿主包路径、模型看到的路径和沙盒恢复后的路径不能混用；路径映射及原生 Skill 指令是接入验收的一部分。

插件内的辅助模型调用走 Model Gateway，携带 purpose、pluginId、parentInvocationId，避免人格/媒体转换等 hook 递归触发自己。区分“调用 Agent”和“调用一次模型”；视觉转述或报告子步骤不必启动完整 Pi 会话。

## 可观察、可重放

工作台按扩展点展示：

- 匹配到哪些 handler、有效顺序、优先级来源、before/after 约束。
- 字段最终由谁提供，哪个修改被拒绝、哪个独占槽发生冲突。
- 各 handler 耗时、等待、异常、跳过原因、输入输出体积和模型用量。
- 本轮 profile/Persona/plugin generation 与任务、工具、子任务、交付回执关联。

支持用已记录的输入和 provider/tool 结果做 dry-run，不实际发送消息、保存领域数据或调用付费模型。使用不可替换的自建外部 I/O 的插件标为“不能完整回放”，不伪造确定性。
