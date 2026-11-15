# 已安装 AstrBot 插件与框架需求映射

目录盘点日期：2026-11-08。来源：本机已部署插件源码。**这是一份功能索引，不是当前启用清单或迁移优先序。** 2026-11-09 已补充 [实际启用配置与近期使用](runtime-baseline-2026-11-09.md)，应优先据此确定范围。

## 范围与证据强度

- 该目录有 **33 个插件目录**。盘点元信息、入口、事件装饰器、动态注册和跨层修改，并重点阅读共享路径；不是逐行审计所有业务代码。
- 32 项来自实际部署源码。image_generation 部署目录为不可读的 0700 目录，本轮没有改变权限；该行来自 astrbot_plugin_image_generation 维护仓库，部署版本未确认。
- 第一版未读取到受保护的全局/渠道配置；第二版通过只读导出与状态库补齐：22 个目录插件全局未禁用、11 个禁用。Lazy Tools、独立群流水、HAPI、PriceAI、绘画经验等已关闭，下文案例不能当作它们正在工作。
- data/plugins.json 是插件市场索引，不作为已安装清单。配置 schema 用来理解功能，没有抄录运行凭据或人格正文。
- 核心参考版本对应容器镜像标签 soulter/astrbot:v4.28.0；读取公开 tag，commit a412146401426c0cdff8bbefb8627a03da519da8。未声称检查了镜像内所有定制修改。

## 逐项映射

以下省略共同目录前缀 astrbot_plugin_；版本来自所读取的 metadata。

| 插件 / 版本 | 实际功能范围 | 框架需要的支持 |
| --- | --- | --- |
| anime1_list v1.0.0 | 动画更新、番剧列表、观看地址；tool + 指令 | 查询 Operation、缓存、周期刷新 |
| batchrecall v1.2.0 | 自动、引用、编号、批量撤回；确认与平台通知核对 | 真实交付回执、列表快照、Interaction、延迟 Job、撤回状态机 |
| bililive_perception v0.1.0 | 直播窗口音频/画面感知、房间映射、导入导出、模型覆盖 | 外部服务 connector、采样 Job、媒体/产物、purpose 模型配置 |
| biliup_persona v2.0.0 | UP 主 RAG、知识图谱、别名、话题检索、增量抓取 | 领域知识服务、embedding、采集任务、独占数据 namespace；不等同 Bot 人格 |
| biliVideo v2.0.1 | URL/小程序/短链识别、视频总结、扫码登录、订阅推送、长图/转发 | 输入识别与 claim、持久 Interaction、凭据、Job、订阅、多目标交付 |
| channel_generation_profiles v0.2.2 | 按渠道选择 ComfyUI/生图模型与工作流，隔离客户端和排队任务配置 | 配置作用域、每次调用快照、领域扩展点、generation 租约 |
| comfyui_pro 2.4.2 | 工作流、LoRA、提示规则、工具/指令绘图、重绘、输出装饰和直发 | 生图 Operation、资源队列、共享配置所有者、产物与交付分离 |
| context_enishi v0.4.5 | 群流水、紧凑 META、图片临时转述、历史/成员查询、工具/Skill/结果收纳 | Event Store、Context 投影、原生媒体引用、Capability Catalog、轮次资源寿命 |
| cpa_usage 0.3.0 | 匹配实际 Provider，查询配额并渲染容量卡片 | 模型选择元数据、只读配额 connector、渲染资源 |
| drawing_experience 1.1.2 | 提示词草稿和版本、成果建议、用户确认后写入独立知识库 | 版本化数据、显式确认、提交回执、RAG namespace、会话绑定 |
| gemini_search v1.3.0 | 搜索、网页抓取、截图分析、截图直发 | 查询/视觉 Operation、浏览器/截图服务、引用和产物、独立模型用途 |
| grok_video 1.0.0 | 图片和提示词生成视频，后台任务与状态反馈 | 长任务、取消/查询、进度、媒体交付 |
| grok_web_search v1.6.7 | 搜索、抓取、来源链接；指令、tool、Skill，多种输出 | 同一 Operation 的多入口、source 引用、缓存/渲染、工具元信息 |
| group_context_flow v0.2.2 | 非触发消息持久化，按 conversation 增量注入，兼容压缩 | 与 Enishi 共用日志/游标契约；上下文区段去重与唯一提交边界 |
| group_llm_guard 1.1.0 | 群 LLM 黑白名单，保留指令入口 | 分支级 policy，不能一并停止归档/指令/控制 |
| gsvi_short_tts 1.4.1 | LLM 相关短文本转语音；按渠道音色/概率/长度，语音目录刷新 | 输出来源和阶段、呈现策略、音频 Artifact、受限生命周期资源 |
| hapi_connector v3.2.2 | 远程编码会话、专注接管、文件、审批、戳一戳、关键词、SSE 推送、WebUI | 会话所有权、Interaction、外部流、控制通道、平台原生通知和插件页面 |
| image_generation v1.6.5（维护仓库） | 多模型/Provider、预设与绘图人设、参考图、异步提交/轮询/取消/历史、Web API | Provider SPI、任务状态机、Artifact、公开领域服务、配置和数据版本 |
| kuang 0.9.0 | 头像/图片/GIF 检测与视觉效果，自动匹配、模型资源和并发参数 | 媒体解析、算力 Worker、命名资源限额、matcher、产物和模型缓存 |
| lazy_tools v1.1.0 | 工具搜索/加载/卸载、会话记忆、组与说明管理、Skill 提示压缩、管理页 | 统一能力目录和暴露策略、可编辑元信息、token 预算、配置页 |
| llm_monitor v0.4.3 | 模型请求、负载、耗时、用量、工具与 continuation，WebUI | 核心结构化观测、父子 span、重试/用量事实，独立消费与页面 |
| llm_result_final_only 1.0.1 | 过滤 Agent 中间输出，兼容流式并保留工具直发 | 输出 phase/origin 和 visibility policy，不能靠替换 runner.step |
| portrayal v1.1.7 | 群友历史画像、背景注入、克隆/切换/恢复人格、保护名单 | 历史能力、领域画像、Context 片段、Persona 绑定、数据范围策略 |
| qq_group_daily_analysis v5.5.1 | 多平台群分析、增量游标、周期运行、用户/话题统计、日报漫画、模板、群文件 | 历史覆盖语义、分步 Job、模型预算、图像服务、模板和原生上传能力 |
| remove_blank_lines v1.0.0 | 发送文本空行整理 | 简单、可排序且幂等的文本 transform |
| restart v1.1.1 | 重启、定时重启、重载与前后通知 | 受授权的运维 Operation、排空、生命周期与 Cron；不是任意宿主 Shell |
| skills_mcp_manager 0.2.0 | Skills/MCP 的指令和工具管理、安装/更新/扫描、报告注入、确认 | 包生命周期、Interaction、Job、目录变更、MCP 运行时与注册撤销 |
| status v2.1.0 | 主机指标、月流量、卡片与可选 LLM 分析 | 指标 connector、时序数据、图像渲染、辅助模型与资源文件 |
| tattle v1.0.0 | 模型主动向配置的接收者发送告状消息 | 显式多目标 DeliveryIntent、目标授权和回执，不限当前会话 |
| tim_forward_fix v0.2.0 | QQ 合并转发拆长文本和预览裁剪 | OneBot 原生 payload transform、稳定排序、单次提交 |
| valorant_analysis v1.0.0 | 玩家绑定、状态/同步/探测、对战数据拉取和 LLM 报告 | 用户账号数据、外部 API、分析任务与用途模型 |
| builtin_commands_extension v0.1.0 | 管理员、插件、模型、会话历史/切换/删除/命名、人格管理 | 管理命令、权限、帮助、生命周期服务、命令冲突诊断 |
| priceai_monitor 0.1.0 | 监控能力管理、会话订阅、周期分析、WS 唤醒 + HTTP 拉取/ACK/NACK | 外部 Event Source、持久 Inbox/Outbox、多目标通知、幂等与重试 |

独立 Skill 目录还包含 chat_replay、H3/Krea2 提示、子 Agent 编排、推文抓取以及多种语音提示资源。插件目录中另有附带 Skill。这里不据此推断每个 Skill 已启用，或其引用的工具已经安装。

## 关键证据与设计含义

### A. 优先级已经存在，但不足以表达所有权

- [AstrBot 注册表](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/astrbot/core/star/star_handler.py)：按 priority 降序排列，再做 activated/plugin scope 过滤。
- [Enishi main.py](source:deployed/astrbot_plugin_context_enishi/main.py:25)：EARLY_GROUP_PRIORITY=2147483627、LAST_LLM_PRIORITY=-2147483647；同一插件横跨收消息、LLM 前、工具前、完成和结果装饰边界。
- [Lazy Tools](source:deployed/astrbot_plugin_lazy_tools/main.py:82)：priority=-50000，替换请求工具集合，并在异常时回退全量工具。
- [独立群流水](source:deployed/astrbot_plugin_group_context_flow/main.py:330)：使用 sys.maxsize 两端的 priority，处理注入和保存边界。

当前状态修正：工具收纳是排他的，Enishi 工作、Lazy Tools 关闭，独立群流水也关闭。该源码比较只说明可借鉴的策略实现与历史边界，不再作为当前双插件冲突的设计前提。框架的数据加工与单一收纳策略仍需分工明确。

### B. 跨插件配置隔离已经发展成生命周期问题

[ComfyUI integration](source:deployed/astrbot_plugin_channel_generation_profiles/integrations/comfyui.py:87) 替换目标 API/方法；runtime 按 profile 缓存独立客户端，submit 保存客户端快照，wait 使用原快照，卸载时为在途提交保留必要包装。

这是值得保留的工程经验。新框架将 profile、提交快照和 generation 租约内建后，频道配置插件只需调用公开服务，不必检查别的插件私有字段和函数签名。

### C. 监控、最终输出和媒体不能互相包装 runner

- [Enishi capability integration](source:deployed/astrbot_plugin_context_enishi/capabilities/integration.py:16) 包装 reset、_transition_state、_handle_function_tools 与工具执行器，并参与 context manager 的每步处理。
- [final_only OutputGate](source:deployed/astrbot_plugin_llm_result_final_only/output_gate.py:37) 包装 ToolLoopAgentRunner.step，区分 llm_result、streaming_delta、tool-direct 等。
- [TTS outgoing](gsvi-deployed-1.4.1/outgoing.py:109) 同时接 respond stage、Context、平台和 Event send，并用 task/destination scope 防重入。
- [LLM Monitor 入口](source:deployed/astrbot_plugin_llm_monitor/main.py:320) 区分任务、模型、attempt、retry、工具和 continuation。

含义：提供明确的每步上下文投影、模型尝试事件、输出阶段和交付入口。单独进程并不能自动解决对这些公共对象的语义争用。

### D. 同一原生发送对象被不同功能使用

[batchrecall delivery](source:deployed/astrbot_plugin_batchrecall/delivery.py:92) 包装 api.call_action 获取真实 message_id，并监听撤回通知；[TIM 修复](source:deployed/astrbot_plugin_tim_forward_fix/main.py:29) 也包装 call_action，但修改发送前的转发负载。

两者在谨慎保留其他包装器，但其顺序不由普通 event hook priority 统一管理。新设计分别提供 transport.prepare 和 delivery.receipt，并覆盖指令、工具直发、定时/后台发送的全部入口。

### E. 输入接管、审批和可靠外部事件是一级流程

- [HAPI focus/关键词/戳一戳](source:deployed/astrbot_plugin_hapi_connector/main.py:489) 会匹配当前窗口的交互状态并调用 stop_event；还存在 SSE listener 与 pending manager。
- [绘画经验](source:deployed/astrbot_plugin_drawing_experience/main.py:177) 提供 stage/history/offer/save/search，维护 pending draft、会话版本和确认收据。
- [PriceAI](source:deployed/priceai_monitor/main.py:93) 先发送，再 ACK；失败 NACK，WS 仅作为拉取通知。

当前状态修正：这三项插件均已关闭，作为后续扩展案例保存。当前异步基础机制的优先依据来自已发生的子 Agent、Cron、生图结果回流，而不是这些停用插件。

### F. 人格、技能与 Agent runtime 可复用的边界

- [AstrBot PersonaManager](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/astrbot/core/persona_mgr.py) 包含 prompt、begin_dialogs、mood imitation、tools、skills、custom error reply，并处理会话/规则选择。
- [SkillManager](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/astrbot/core/skills/skill_manager.py) 区分 workspace、插件附带和沙盒来源。
- [SubAgentOrchestrator](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/astrbot/core/subagent_orchestrator.py) 将人格、模型和工具定义投影为 handoff。
- [Pi v1.5.0 公共扩展接口](../pi-im-bot/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:690) 区分 context 与 context_with_system，并明确 tool_call 参数修改后不自动重新校验。

含义：保留这些用户能力，用框架 Profile/Persona/Catalog 和单一 Pi Bridge 表达；不把 AstrBot 的私有对象和调用栈移植到 TS。

## 从盘点得到的最小完整性标准

架构至少能表达：多入口调用、规则与指令、人格与渠道配置、按需工具/Skill、上下文投影、插件内部模型调用、长任务、等待用户、主动多目标通知、媒体与原生平台操作、真实回执、监控、页面、安装升级及数据迁移。

这里的“最小”是公共机制最小，不是把现有复杂能力删到只剩几个工具。具体实现可分批，但不能用私有 patch 留下未定义的公共边界。
