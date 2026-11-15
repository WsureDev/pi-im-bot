# 聊天会话范围与触发人权限

状态：第一阶段已实现，2026-11-09。一个群聊、私聊或 Mock/WebChat 会话窗口共享当前上下文，人格与工具等配置随该会话生效。没有按群员建立多份 Agent user 状态。

## 1. 区分三种标识

| 标识 | 含义 | 生命周期 |
| --- | --- | --- |
| conversationScope / 聊天来源 | 某个群、私聊窗口或 WebChat 会话 | 跨消息、重连和多次任务稳定 |
| currentConversationId | 此来源当前选中的对话及上下文 | 新建/切换对话时改变 |
| triggerIdentity | 本次触发来自谁，以及其可用权限 | 随触发消息/执行上下文绑定，不写成群的全局“当前用户” |

群员昵称和 ID 是发言来源。群内不同 sender 触发，仍使用同一 currentConversation 的历史、人格、工具目录、Skill/知识库绑定和收纳状态。

建议 scope key 使用平台、机器人账号、会话类型和原生会话标识：

- 群聊：原生群 ID，群员 senderId 不进入 scope key。
- 私聊：该私聊对端/窗口标识。
- WebChat：应用层聊天会话 ID，不能使用登录用户或 WebSocket 连接 ID 将所有窗口合并或反复新建。
- 话题是否独立是显式行为配置；当前群聊默认全群共享。

同一来源可以有多个历史 conversation，但任一时刻有一个当前选择。切换该指针后，群员后续使用新的共同上下文；这不表示此前按成员拆过会话。

## 2. 本次按来源核对的证据

只读查询 llm_monitor 的 tasks，并关联 AstrBot preferences 中 scope=umo、key=sel_conv_id。时间窗口为 2026-11-02 01:28:33 至 2026-11-09 01:28:33（Asia/Shanghai），排除带 parent_task_id 的子任务。下表将来源与 conversation ID 匿名化。

| 来源样例 | 根任务记录 | 不同 sender | conversation 情况 |
| --- | ---: | ---: | --- |
| 群 A | 224 | 24 | 同一个 conversation_id，仍是当前选择 |
| 群 B 的当前对话 | 61 | 9 | 同一个当前 conversation_id |
| 群 B 的历史对话 | 288 | 31 | 同一个旧 conversation_id；该来源合计出现两个历史 ID |
| 群 C | 29 | 10 | 同一个 conversation_id，仍是当前选择 |

窗口还包含 10 个 WebChat 来源、23 条根任务。没有普通 QQ 私聊根任务样本；Cron 的 FriendMessage 记录不作为真实私聊样本使用。私聊使用相同来源绑定机制的结论来自 ConversationManager 接口，不虚构近期调用数据。

源码也将两类信息分开：

- llm_monitor/main.py 的任务记录同时存 umo、conversation_id 和 sender_id；多个 sender 可以落在同一个 conversation。
- ConversationManager 按 unified_msg_origin 读取/修改 sel_conv_id。
- FunctionToolManager 的非内置工具代理在实际 call 时检查触发事件的权限；内置工具还有各自的检查。审计时没有额外的全局 tool_permissions 配置记录，不能因此推断所有工具都无权限约束。

## 3. 共享工具目录与本轮可调用权限

共享的是会话状态与配置。某次工具调用是否获准，还取决于触发来源和工具规则。

~~~text
共享会话：历史 / 人格 / 工具与资源目录
                 ↓
本轮触发消息：speakerId / 来源 / 权限上下文
                 ↓
工具调用：工具已启用且本轮执行上下文有权调用
~~~

执行权限从可信平台事件或本地操作入口获得。昵称、模型生成的 actorId、提示中的“我是管理员”都不能设置权限。

可以为模型提示本轮可用范围，但真正校验发生在执行端，覆盖插件工具、MCP、Skill/脚本间接调用和子 Agent。不能仅凭“模型看到了这个工具”或“上轮管理员用过它”放行。

## 4. 多人合批时的权限规则

多个成员的发言仍进入同一个共享上下文，普通问题和合作补充可以合并理解。区别只在执行授权：

1. 区分真正触发本轮的消息与作为背景加入的群流水；背景中出现管理员，不赋予本轮管理员权限。
2. 不把多个触发人的权限取并集，也不直接采用最后一条消息的身份。
3. 初版混合触发批次中的自动工具调用，使用共同允许的能力。受限指令可在入批前走独立的指令执行路径；其他需要单独授权的执行，绑定确定的触发输入再调度，仍使用同一共享会话背景。
4. 受限动作的执行上下文由框架绑定，不能让模型从批次中任意挑一个高权限 sender 作为调用者。来源不确定时不提升权限。
5. 不同成员可以补充同一个 Job；补充形成新 revision，涉及新增/变化动作时，按该修订的触发依据重新检查权限，不能沿用其他成员以前的高权限去执行新指令。

这不要求建立成员私有 Persona、记忆或长期队列。权限差异属于 invocation/run 的属性。

## 5. 异步与并发中的身份固定

群中同时有 root 和后台任务时，每个任务保留自己的触发依据。不能使用共享会话中的可变 currentSender/currentRole 字段，否则新消息会改变旧后台任务的权限。

后台 Job/子 Agent 保存：

~~~text
originScope / rootConversationId / conversationEpoch
sourceMessageIds / triggerIdentityRefs / authorizationPolicyRevision
requestId / jobId / requestRevision / parentTaskId
~~~

子 Agent 和嵌套工具继承该执行上下文或进一步收窄，不因为“由系统回调”而获得更高权限。权限撤销在实际执行时生效；复用上下文或恢复任务不等于复用永久授权。

取消依据引用、任务 ID 和群行为规则定位与授权。共享群状态不自动意味着所有人可调用管理工具，也不意味着每个人只能影响自己提出的任务；具体权限由规则决定。

## 6. 对当前方案的影响

- root 仍是聊天来源共同的主对话；子 conversation 按工作建立。
- 合批按同一会话处理，不按群员拆 user；内部保留发言关联与独立鉴权上下文。
- Pi durable 管理 conversation/task/document，Bot 负责把可信的触发依据绑定到工具执行。
- 请求、人物资料、工具权限与持久会话状态不能再共用一个含义模糊的 userId 字段。

第一阶段已将 scope/current conversation/trigger identity 分开保存并用于真实 Pi 调用；工具调用有固定授权上限和当前规则检查，Cron 继承创建来源。多人权限交集已经过测试，合批调度、pi-durable 和后台 Job 尚未接入，当前同聊天范围仍串行。
