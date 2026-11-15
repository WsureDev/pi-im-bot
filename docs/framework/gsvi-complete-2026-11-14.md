# GSVI-only 第二稿（2026-11-15，待独立审核）

> Historical validation note: ${VALIDATION_DIR} is a placeholder, not a published location. Local logs, patches and orchestration inputs are not included in this Git repository.

本稿修复首稿审核确认的两项：source合法max_chars被2000字符限制架空、原可信Agent工具发送被排除。保留首稿完整13叶schema/preset/同页凭据和flat迁移。**本稿不宣称全部源功能1:1完成**，通用边界和未完成项明确列在 [outgoing/streaming逐分支矩阵](../plugins/gsvi-outgoing-parity.md)。禁止的动态音色验证没有执行。

基线仍Core c15171467bb636b7705956bb2dc3e50c7dbe85f3、插件 aaff7a3099f95d3af64cb41466aae5860c5a4c8a；未提交、未写Git元数据。用户授权的插件AGENTS强制完整性规则保留并进入累计patch。首稿patch/包/报告/机器收据及完整源码已保存任务 round1-handoff/，后续产物不覆盖该历史。

## 本次实际改动

GSVI text、RenderInput、显式命令声明不再加2000/100000上限；移除POST16KiB、models128KiB/infer16KiB、audio_url4096、GSVI基址2048、每列表100项及8MiB音频等专有限额。POST字段与空参考语言语义不变；JSON严格UTF-8，原生音频按源12字节RIFF/WAVE检查，不再加codec/MIME限制。接收数据服从通用Artifact单文件额度，旧maxAudioBytes只兼容打开旧资源文件，原生保存清除。源ServiceUrl独立，Comfy共享URL schema未改。长服务timeout使用分段timer，不因合法大整数超出32位timer调用直接失败。

原chat_send及Agent工具内的delivery.send现在由Core真实工具闭包标记agent-tool/tool-direct，普通指令/通知仍不获得该来源。选择Hook只做短选择；render在其后、原Delivery调用中有界执行，最多10秒及已知剩余预算75%，还继承公开工具AbortSignal和RPC deadline。Renderer使用既有background/data:none预算、嵌套链与总Worker预算，调用前保留一个前台控制槽；maxWorkers1或槽不足在POST前回退原文，validators独立。

同一Outbox先持久计划、再started、再complete/fallback，然后等待真实平台ACK才返回delivered/messageId。没有fire-and-forget、伪ACK、重复模型/工具或第二发送所有者；inline不创建Job/renderAdmission，普通非render仍不克隆恢复快照。Pi工具参数、rawReply不变，inline消息历史保留原text；发送副本和附件另记。渲染前后及发送前复核原Actor天花板、release/grants、原服务ID/版本，撤权/stop/new不能变成晚发回退。进程中断保留事实与presentation/transport未知，不自动重抽/重POST/群发。

0.3同页配置/secretCore托管、刷新缓存生命周期、flat7一次迁移、scope设置和voice.json/policy.json/渠道开关不变。更新脚本增加Core inlinePresentationContract=tool-send@1握手，防止只更新首稿Core就装第二稿包；这只是协议存在标记，不是动态验收或健康证明。普通用户脚本仅准备，未更新正式包/启用状态/原生进程。

## 静态矩阵与剩余差异

源 [10文件SHA/作者/许可记录](gsvi-complete-source-2026-11-14.json) 包含新增审读的streaming.py。来源部署1.4.1、作者wsure，未发现LICENSE，不推断Python实现可再分发；只静态读，不运行Python。逐字段对应在插件MIGRATION，outgoing/context/platform/event、final Gate、流帧积累/mixed/控制/工具帧/Web附件各分支在专门矩阵。

未完成的边界包括：原始AstrBot多break generator公开兼容入口、超大catalog完整跨512KiB RPC帧分页、超过通用100000字符/Point预算/结果摘要的无损传输，以及超过通用后台operation最大300000ms的等待。通用Artifact/平台媒体/Worker/Job额度也有限。这些不是用户批准的例外，不用“Core预算”将其标成1:1完成。当前Bot按既有完整逻辑消息单位交付，Pi token/delta仍只做UI进度；不造无消费者流API或第二Agent引擎。

## 允许的验证及隔离

只做原schema逐属性对照、纯配置（含max_chars=3000）、静态schema/源码检查、Core/插件typecheck、Core隔离web构建、GSVI单包build/双pack、格式/API文档同步和disabled真实main页面。静态检查只检查类型定义/源码，不构造合成请求。旧含音色动作的tests未运行；既有音频额度fixture只静态改为通用Artifact额度，未执行。没有新数据库测试。

真实停用页仅上传本轮GSVI ZIP，后端与实例关闭，保存refresh=false配置，三项secret掩码和全部原字段可见；无模型/音色/刷新/合成/音频请求。task页面和main进程结束清理。正式19335只读，仍GSVI0.2停用；19336旧预览不动。不读root0600配置、旧KV、对话/图片/模型，不执行已废弃双配置审批，不碰容器/Root/正式上游。

既有19337开发源watch:true会在公共API快照变化后间接重建各目录；本轮公共快照在构建收口阶段同步；静态复核补修取消标志保留后又同步一次，共两次，不修改或停止该服务。派生Comfy dist/API-SNAPSHOT若被watch改写，最终以任务开始时SHA对应的已接受包原字节恢复并复核26文件及正式元数据一致；不能宣称从未间接改变，也不把watch开发包当作本轮Comfy交付。

交回包括累计patch、相对首稿增量patch、两种回放/全源码SHA、包双pack及页面/检查收据，均在 `${VALIDATION_DIR}`。主会话独立审核后统一普通用户提交、仅GSVI更新；本轮未部署。
