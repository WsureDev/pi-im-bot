# 实际配置与近期使用基线

本次补充核对启用状态、资源绑定与监控记录，修正此前只根据安装目录推演需求的问题。

统计快照：**2026-11-09 00:08:49，Asia/Shanghai**。24 小时窗口从 11-08 00:08:49 开始；7 天窗口从 11-02 00:08:49 开始。配置读取与统计在本次审计过程中完成，配置与历史使用不能当成同一时刻的状态。

## 1. 数据来源与口径

- AstrBot data_v4.db：只读查询 preferences 中的 inactivated_plugins、配置路由、会话选择，以及 Persona 的工具/Skill 绑定；不读取对话正文。
- cmd_config.json 和两个实际配置档案：因宿主权限不足，通过容器只读导出到私有临时目录，提取非凭据字段；未修改配置。
- mcp_server.json、skills.json、sandbox_skills_cache.json，以及本地/插件/内置 Skill 目录。
- knowledge_base/kb.db：只读查询集合、文档数量和索引元数据，不读取文档正文。
- llm_monitor/events.sqlite3：只读连接并包含现有 WAL，统计 tasks、llm_calls、tool_calls；不使用忽略 WAL 的 immutable 模式。

“安装”“配置启用”“被 profile/Persona 选中”“当前可加载”“近期调用过”分别记录。全局启用名单不证明每个插件启动成功；MCP active 不证明服务目前健康。没有可复用的 Dashboard 登录会话，因此没有伪称完成运行时健康检查。

监控开启、保留期 30 天、脱敏开启。当前库共 3239 条任务记录。此监控主要覆盖 AstrBot Agent/工具调用，不是所有普通指令、消息装饰器、TTS 或独立插件 HTTP 调用的全面计数器。零工具调用不能证明某插件没有在使用。

## 2. 当前插件开关

33 个用户插件目录中，**22 个在全局持久状态中未禁用，11 个已禁用**。此计数不包含镜像内的保留插件。

全局未禁用：

~~~text
batchrecall                  biliVideo
bililive_perception          biliup_persona
channel_generation_profiles comfyui_pro
context_enishi               cpa_usage
grok_web_search              group_llm_guard
gsvi_short_tts               image_generation
kuang                       llm_monitor
llm_result_final_only        portrayal
qq_group_daily_analysis      remove_blank_lines
restart                     status
tim_forward_fix             builtin_commands_extension
~~~

已禁用：

~~~text
anime1_list          drawing_experience
gemini_search        grok_video
group_context_flow  hapi_connector
lazy_tools          skills_mcp_manager
tattle              valorant_analysis
priceai_monitor
~~~

其中通常省略 astrbot_plugin_ 前缀。禁用状态中还存在已不在安装目录的历史记录，未把它们计算为当前安装插件。

配置档案还会进一步过滤：

| 配置档案 | 目录插件可参与上界 | 关键差异 |
| --- | ---: | --- |
| default | 22 | plugin_set 为 *；QQ 账号路由到该档案 |
| telegram | 18 | 明确的插件列表；不含 Enishi、GSVI 短 TTS、final_only、Grok 搜索 |
| clawBot | 2 | 与全局开关求交后，仅 image_generation 和 builtin_commands_extension |

列表内的 gemini_search 不会因为被某个档案选中就绕过全局禁用。插件自身还可能有渠道范围或内部开关，所以这些数字是配置过滤结果，不是每条消息一定执行的处理器数量。

### 工具收纳

当前核对到 Enishi capabilities.enabled=true，new_group_mode=folded，idle_rounds=10，fold_skills=true，archive_results=true。Lazy Tools 与独立 group_context_flow 已禁用。

因此，当前工具收纳是**选定一个策略工作的排他能力**，不能再用“Enishi/Lazy Tools 同时抢收纳权”作为当前系统的主问题或首批验收场景。

## 3. MCP、Skill、知识库与 Provider

### MCP

13 个配置项中，9 个 active=true，均使用 streamable_http：

~~~text
websearch-network
search_exa
search_parallel
github_deepwiki
danboorusearch
comfyui_lora_manager
OpenAI-Image-Gateway
reference-image-finder
x-image
~~~

未启用：瑞幸咖啡、麦当劳、plt-fabric-nester-mcp、priceai。

工具名不总能唯一说明来源。本次同时查看了 enishi_load 的能力 ID，例如 mcp:danboorusearch/search_tags、mcp:comfyui_lora_manager/search_local_inventory、plugin:astrbot_plugin_comfyui_pro/comfyui_txt2img；不能将所有搜索、生图工具都算成插件调用。

### Skill

skills.json 有 15 项，14 项标记启用，chat_replay 标记关闭。

| 来源核对 | 名称 |
| --- | --- |
| 本地且沙盒缓存可见，已启用 | Minimax-H3-Prompt-AgentSkill-main、krea2-prompting-main、neo_lol-chuanzi-guide、neo_subagent-orchestrator-guide、neo_x-tweet-fetcher、neo_japanese-english-tts、neo_indian-english-tts |
| 内置目录与沙盒缓存可见，已启用 | documents、pdf、skill-creator、spreadsheets |
| 沙盒缓存可见，已启用 | python-sandbox |
| 插件附带资源存在，标记启用，缓存未见 | skills-mcp-manager |
| 有启用标记，但在已核对来源中未发现 | browser-automation |
| 本地与缓存可见，已关闭 | chat_replay |

沙盒缓存时间为 2026-11-08 19:44:49 +08:00；缓存存在不等于本轮已现场验证 guest 文件可读。

SkillManager 的插件资源扫描不以插件 activated 为唯一条件，因此“管理插件已禁用”不自动等于“它附带的 Skill 已禁用”。这恰好要求新框架把资源目录与执行插件的生命周期分开。

近 7 天 enishi_load 中，完整 ID skill:both:both/neo_subagent-orchestrator-guide 出现 33 次，另有 8 次 subagent-orchestrator-guide 简名请求。它们是加载请求，不应直接相加为成功加载次数。历史记录还出现 neo_gsvi-tts 等当前清单没有的名字，说明配置与使用发生过变化。

### 知识库

| 知识库 | 文档数 | chunk 数 | 已检查档案的绑定 |
| --- | ---: | ---: | --- |
| bilibili_persona | 19 | 61 | default |
| 群主对应主播 | 0 | 0 | default |
| comfyui | 0 | 0 | telegram |
| drawing_experience_results | 3 | 25 | 未被这三个档案选中 |
| 抽象知识 | 0 | 0 | 未被这三个档案选中 |

这些是元数据计数。默认与 telegram 档案开启 agentic KB；知识库是否存在、是否有内容、是否被绑定、是否检索过需要分别展示。

### Provider 与 Persona

- 默认配置声明 12 个启用的 Provider source，30 个 Provider/模型条目中 25 个启用。
- 默认主模型配置为 GPT-6.1 Sol，并有多个 fallback；实际请求还可能使用会话级覆盖、子 Agent 模型和近期配置变更。
- 近 7 天调用较多的是 Grok 4.6、Gemini 3.8 Flash、GPT-6.1 Sol、DeepSeek；近 24 小时 GPT-6 Astra 与 GPT-6.1 Sol 的记录最多。这是使用窗口变化，不是模型质量排名。
- Persona 表有 16 条资源；当前配置明确绑定主助手人格及子 Agent 人格，并存在会话级覆盖。未复制人格正文。
- 默认启用两个子 Agent：subagent_easy_task、comfyui；subagent_complex_task 关闭。telegram/clawBot 档案未启用子 Agent 编排。
- 绘图 Persona 显式限定了绘图、素材、LoRA 等工具和 H3/Krea2 两个 Skill；因此“全局启用”也不等于每个 Agent 都看到所有资源。

## 4. 近期调用频次

| 记录 | 最近 24 小时 | 最近 7 天 |
| --- | ---: | ---: |
| tasks | 95 | 928 |
| 其中带 parent_task_id 的任务 | 23 | 119 |
| llm_calls，含 retry/fallback | 290 | 3009 |
| tool_calls | 273 | 3007 |

7 天内平台分布为 QQ 798、Cron 104、WebChat 26 条任务记录；24 小时为 QQ 72、Cron 23。7 天工具涉及 521 个任务、76 个工具名。这些是执行记录，不是独立用户意图次数。

工具按用途归类，每个工具名只计入一类；各类任务数会重叠：

| 用途 | 24h 调用 | 7d 调用 | 7d 涉及任务 |
| --- | ---: | ---: | ---: |
| 能力发现与加载 | 90 | 584 | 167 |
| 沙盒执行与文件 | 21 | 632 | 100 |
| 网页搜索与抓取 | 62 | 564 | 127 |
| 图片理解与取图 | 3 | 194 | 127 |
| 图像生成、素材与任务查询 | 29 | 605 | 90 |
| 子 Agent 转交 | 23 | 97 | 95 |
| 主动发送与创建计划 | 25 | 172 | 144 |
| 聊天历史与成员感知 | 6 | 92 | 45 |
| 知识库检索 | 0 | 11 | 5 |
| B 站检索与直播感知 | 14 | 34 | 17 |
| Skill 维护工具 | 0 | 22 | 5 |

图像相关 605 次包含查询库存、标签、状态、预设，不是生成了 605 张图。工具收纳的 584 次约占工具执行记录的 19.4%，属于当前基础能力。

部分高频工具：enishi_find 416、astrbot_execute_shell 387、enishi_load 168、send_message_to_user 167、describe_channel_image 148、web_search_tavily 137、search_local_inventory 103、comfyui_txt2img 84。

### 使用模式与工程含义

1. **发现/加载 → 业务能力**：80 个任务同时出现 enishi_find 和 enishi_load；收纳应成为单一、可调的内置策略，资源来源可来自插件/MCP/内置工具。
2. **素材检索 → 工作流 → 生图**：27 个任务同时调用 comfyui_workflows 与 comfyui_txt2img；有明确的 MCP 标签/LoRA 查询与插件生图协作需求。
3. **后台子 Agent → 回流/交付**：97 次转交中，comfyui 37 次全部后台，easy_task 60 次中 48 次后台、12 次同步。共 85 次后台，不能只设计同步工具循环。
4. **脚本 → 文件/媒体 → 发回会话**：42 个任务同时出现 Shell 与 send_message_to_user。387 次 Shell 中 QQ 238、Cron 86、WebChat 63；63 次 WebChat Shell 集中在 3 个任务，不能直接代表日常聊天习惯。
5. **Skill 和运行环境在变化**：抽样方式是对 7 天内全部相关工具输入做关键词分类，不输出原始命令。387 次 Shell 中 37 次含 SKILL.md、139 次含语音相关标记；分类重叠且含调试，因此不能称为“139 次成功语音业务”。

### 时延与观测限制

- describe_channel_image：148 次中 125 次 recorded completed，平均 46.07 秒；23 次 recorded error，平均 120.02 秒，接近配置的 120 秒工具超时。需要独立的视觉请求预算、取消和可见状态，不能据此直接断言所有错误原因。
- generate_image：34 次记录中 22 次 completed、12 次 error；completed 平均约 0.1 秒，通常只能说明工具提交/返回快，不代表异步图像生成完成得快。
- 7 天记录有 140 次 fallback、24 次 retry 类型 llm_call。不同层的 retry_attempts 是嵌套 span，不能相加为业务重试次数。
- gemini_search 当前插件关闭，但 7 天窗口有 100 次同名调用、24 小时为 0。历史调用不能作为当前仍启用的证据，工具名称也不是唯一来源标识。
- TTS、空行处理、最终回复过滤、撤回和普通指令不能只按 tool_calls 排名。当前已启用的被动功能仍要通过配置与事件链核对。

## 5. 对框架范围的修正

首批基线应围绕数据加工、偏好、行为和内置基建，并接入已启用资源。优先验证能力发现、搜索、沙盒、图片理解、生图、异步子 Agent、Cron/主动交付这些实际链路。

HAPI、PriceAI、绘画经验、Skills/MCP 管理插件等已关闭，不再作为当前最小内核的强制验收门槛。其设计案例可保留为后续扩展参考。

启用状态和日志是设计优先级的证据，不是自动删除低频资源的依据。本次没有启停插件、MCP 或 Skill，也没有修改现有运行配置。
