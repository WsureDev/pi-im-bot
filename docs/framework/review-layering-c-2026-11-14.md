# T/C 后整体分层复审草稿

2026-11-14，NAS实施者草稿，供WSL主审核者独立复审。它区分已写代码、离线证据和未应用生产配置；不替代独立接受。C基线为接受T后的Core b3e9097ca167693264c21abf1ee82b960bfe453b、插件9995e8bb9524d5cd6cb5e84a985901d40ca53cd5。旧 [分层建议](review-layering-2026-11-13.md) 是历史审查，不是当前API。

## 本次补齐的边界

| 层与契约 | 当前实现与证据 | 仍保留的边界 |
| --- | --- | --- |
| Pi会话/模型 | 仍由Pi拥有循环、工具、压缩、单请求fallback。T发送副本保留rawReply；C用公共beforeRequest/context参数投影，真实Pi直接工具/start_job各on/off回归，不增加LLM调用 | 不改Pi内部历史；不追溯重写已有压缩摘要；无第二Agent/monkeypatch |
| Bot可信Invocation | Actor/权限天花板/目标/来源由Core构造；data:none独立于可信前后台预算；管理需要显式comfy_manage且Mock不可冒充 | 尚未统一抽出所有Invocation装配，Coordinator仍较大，但C服务/RPC/状态/传输均自然拆域，没有把业务塞adapter或Pi私有方法 |
| 具名领域服务 | gsvi@1与comfy@1有实际协议、私密认证、版本、预算、取消和来源依赖；管理表单/HTTP与实例绑定可用，浏览器验证真实组件 | 只提供这些领域协议及既有MCP；无任意URL代理/宿主scan，其他服务按真实插件需求扩展 |
| 受管资源 | API-format graph、摘要、允许标量路径/范围/编码/偏移、输入输出和模型/LoRA声明；dry-run导入LoraManager，原件不动 | 节点/模型是否已安装和GPU兼容性未生产验证。没有自动object_info全局同步、上传/img2img/WS收图 |
| 私有共享状态 | pi-durable instance/scope命名空间CAS/版本/额度；跨new持久，instance锁共享，ring登记与receipt标记原子 | 无rawDB、跨插件事务、任意doc访问；没有通用迁移/销毁生命周期，业务schema升级需另行设计 |
| 效果/恢复 | Job operation recover/handle/阶段schema；Comfy逐item写前登记、原服务/prompt_id、稳定Artifact owner、未知不重POST；同进程丢RPC/无handle/restart/取消均测 | 通用插件代码仍可有不透明副作用；不能凭JSON schema宣称自动可重放。Comfy没有提交幂等或per-prompt running取消，未知无ID只能保留 |
| 事实/呈现/交付 | businessStatus、factsComplete和items与delivery分离；partial+unknown仍可reconcile，仅事实更新；统一Outbox、真实part ACK、未知forward不fallback重发。16项实际ACK | 平台总媒体预算/能力仍适用；不能承诺任意256张大图发送成功。未提供任意mention/quote/native对象或跨范围业务发送 |
| T异步呈现 | 保留可信producer、一次概率、原计划恢复、延迟Job/唯一Outbox、明确容量拒绝正文回退、前台容量与惰性admission | 同步chat_send等真实ACK入口继续同步；未知TTS无远端ID无法poll，只按原契约回退与封存 |
| 编排与可诊断性 | service类型、operation actions/data/execution、阶段schema、model.history节点及按消费者能力诊断已有真实消费者；UI展示业务/事实/传输，普通非render零快照 | 全局有效图仍不能完整解释任意scope/selector/授权/自定义point所有排除原因；没有通用资源租约/效果DSL |
| 观察/订阅/计划 | 沿用既有核心计划、持久观察/回执机制 | 仍无插件自注册Cron、外部订阅、任意observe→Job或交互确认平台；本次两个业务不需要，不提前造平台 |

## 业务归属

Comfy插件保留策略、群白名单/私聊、冷却、锁、词库、提示词/负词/LoRA/steps和ring20。Bot不按每个workflow或LoRA业务硬编码图，编译只执行operator登记的标量变换。Bot持有所有者、服务快照、执行/网络预算、Artifacts和发送账本；adapter只翻译typed消息与真实回执。Worker看到目录元数据/服务别名/有界状态，拿不到宿主路径/认证/其他实例数据。

ring20是可移除的调试投影；永久Core receipt是恢复证据；模型history政策是请求前视图。三个生命周期明确分离，pop/off不删除恢复事实，也不伪装秘密已从原审计擦除。资源改动影响新任务，已有任务须按原快照和当前撤销条件继续或停止。

## 离线验证与未应用部分

自编假Comfy/GSVI/模型，真实包/FixturePluginBackend/Worker/RPC/Job与memory/JSONL覆盖基本生成、批16、丢回执、重启、原服务A/B、准确取消竞态、恶意输出、并发CAS/冷却、ring/FIFO、history实际模型投影、目录分页、共享预算与forward未知。没有新增数据库测试；pending presentation部分索引仅核对DDL和查询谓词一致。共享浏览器验证真实资源/实例绑定/任务组件，已关任务页面和临时端口。

源2.4.2与维护2.4.3、19份持久资源、root0600限制和来源SHA保留。13工作流候选只代表可审查转换，原图/配置/模型/生产环境均未应用。正式安装、合法旧状态导出、管理员/群映射、生产GPU兼容性、QQ真实行为和部署授权仍需后续操作，不能从离线结果推断runtime健康。

最终检查、包字节比较、全文件SHA和C基线补丁回放位于任务c目录；精确结果写入迁移报告。请主审核者复核上述边界，按实际源码和本地fixture接受/回修后再普通用户提交。

## C第二轮审核回修

第一稿未获主审接受。已修复非终态手动核对清空已知结果，以及同scope无数据串行锁抵消前台容量两项确认问题。外部finish/cancel/recover/reconcile保留无新result时的旧事实，按item/Artifact单调合并；pending核对仍保留partial与factsComplete:false，后续完成只更新原事实/JobFacts，不创建聊天发送或自动等待。

无数据前后台lane/key仅由Core的真实操作/Job/父调用调度类别构造；同scope前台usage/catalog/管理可在后台POST等待时响应，同lane仍串行。data:scope原私有数据锁、Validators独立预算、maxWorkers1前台合法/后台呈现拒绝、后台嵌套继承及真实key重入、清理后释放总槽均保留。没有新增一套Worker/内存预算，也没有挂私有卷绕过noData边界。Core CAS承担共享状态一致性。

新增memory/JSONL与真实包/Worker/RPC回归覆盖中间pending、再次取消、重启后完成核对的单调事实/无群发，以及max2/max4后台真实POST等待时的同scope前台响应、空闲回收后的冷启动、容器峰值和取消后不复活。精确全量/独立脚本/包/累计与连续增量回放收据以框架报告第二轮节及c目录为准，仍待主审核者接受。

主审核者最终复核与接受结论见 [独立分层复审](review-layering-final-2026-11-14.md)；本文件保留NAS实施者草稿与回修记录。
