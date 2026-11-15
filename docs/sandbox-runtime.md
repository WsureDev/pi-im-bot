# 沙箱生命周期与持久化

状态：实施设计，尚未部署。总决策见 [执行隔离与插件架构](isolation-and-plugins.md)。

## 信任边界

可信层包含 Bot 核心、Pi SDK、本项目编写的能力代理、执行服务和经过固定版本审查的运行时。第三方插件、模型生成脚本、下载内容与工具返回值均不可信。插件即使由自己编写，也通过相同协议接入，防止未来引入例外。

Pi 可继续在可信核心使用现有 Provider。沙箱无需持有 LLM API Key，也无需访问 Provider 管理 API。执行服务只认识 profileId、scopeId、workspaceId、artifactId；不允许插件或模型指定宿主路径、任意镜像、设备、挂载、runtime 参数或环境变量继承方式。

文件范围限制解决误操作；OS/运行时隔离约束恶意代码；版本和备份处理范围内的数据破坏。这三件事分别实现，不能相互替代。

## 目录与所有权

以下是目标布局；当前 data/pi-sessions、data/bot.sqlite 等位置尚未迁移。容器内路径相同，宿主真实目录由部署配置映射。

~~~text
bot-root/
  app/                              Bot 程序与前端，只读
  config/                           核心配置、Provider 凭据
  plugins/<plugin-id>/<version>/     固定版本插件包，只读
  data/
    core/                           Pi sessions、会话、任务、事件、调度、outbox
    plugins/<plugin-id>/<scope-id>/  插件独占的持久状态
    workspaces/<scope-id>/           Agent 工作区版本与清单
    artifacts/<artifact-id>/         文件、音频等产物
  sandboxes/<lease-id>/              每次运行的临时工作副本
  runtime/                          supervisor socket、租约、镜像缓存、运行时状态
~~~

目录名用于管理，权限由独立账户、namespace、挂载和 RPC 强制执行。目录不能全部归一个不受约束的插件进程随意读写。部署根不要求位于用户 home。

| 对象 | 可访问内容 | 禁止访问内容 |
| --- | --- | --- |
| 核心 Bot | app、config、data/core；通过 API 使用产物/工作区 | 不提供任意宿主命令工具；不持有生产 Docker socket |
| supervisor | 自有 runtime、沙箱工作副本、受管工作区与产物 | Provider 文件、个人 home、其他项目、生产容器管理 |
| Agent guest | /workspace 可写；指定 /inputs、/skills 只读；/tmp 临时可写 | Bot app/config/core、其他 scope、插件持久目录、宿主 socket |
| 插件 worker | /plugin 只读；自身 /tmp；通过数据 API 访问自己的 namespace | 其他插件目录、其他 scope、Provider 凭据、核心数据库 |
| 平台适配器 | 受控发送/撤回 API；发送所需的短期产物句柄 | 插件任意文件路径、运行时管理权限 |

core 与 supervisor 的存储归属、UID/GID 在安装时明确；运行中不能依靠 chmod 整个部署目录来解决权限问题。插件代码和 workspace 内容不能被核心自动 import、执行安装脚本或加载为 Pi 扩展。

## 同一架构支持两种部署

**直接部署：** Bun 核心以专用 bot 账户运行；独立 supervisor 以 sandbox 服务账户运行。该账户不在生产 Docker 的 docker 组，rootless 引擎只管理本产品的沙箱。双方使用具有文件权限的 Unix socket。没有运行时时，聊天仍能启动，执行状态显示 unavailable。

**Docker 部署：** Bot 在普通非 root 容器中运行；只挂核心配置/数据和私有 supervisor 客户端通道。supervisor 留在宿主的专用服务账户，或位于另一台 Linux 执行服务器；不要求把它做成 Docker-in-Docker。部署包不挂 /var/run/docker.sock，也不使用 privileged 或 host PID/network。

如果随后将 supervisor 容器化，需单独核验 user namespace/cgroup/KVM 等要求。不能为了“一个 Compose 起所有东西”绕开上述隔离。现有机器的 Docker daemon 与生产容器保持独立。

对外工作台继续遵循 LAN 直接访问习惯；管理 socket 和内部 worker RPC 则必须私有。这里的服务身份和能力句柄用来隔离代码，不是给用户新增网页登录。

## 一个任务的生命周期

1. Admission 固定 actor、scope、插件版本、profile 和预算。scope 包含 channel、account、chat、thread；不接受模型直接选择另一个 scope。
2. 取得 workspace 单写租约及递增 fencing token，记录当前 generation。Cron 与 IM 共享同一工作区时也必须服从该租约；独立 Pi 会话不等于独立文件状态。
3. 从已提交 generation 创建运行副本，装入本次显式输入。创建沙箱，映射为 /workspace。可先使用有体积上限的复制，随后换 reflink/COW。
4. exec/read/write/edit 操作绑定 leaseId 和 deadline。核心不把宿主路径传给模型；所有工具看到相同 guest 文件系统。
5. 取消或超时先中断执行，再于短宽限期后终止整个 cgroup/VM。撤销租约与能力句柄，不能只取消一个 Promise、留下后台子进程。
6. 正常结束停止写入，校验文件数、大小和类型。原子提交新 generation，保留旧版本；使用 generation + fencing token 防止过期 worker 覆盖新状态。
7. 失败/取消不覆盖上一 generation；可保留短期、只读的故障副本供检查。已发送消息、已创建计划等外部副作用不随文件回滚，必须独立记录。
8. 上传待交付产物后释放执行实例。产物、工作区版本、插件数据与实例 TTL 分开回收。

对 Bot 自有工作区可以在成功任务后自动提交，无需每轮询问。个人目录或其他项目不加入挂载；需要导出时使用单独的、目标受限的操作。恢复进程崩溃只恢复持久状态，不自动重放未知结果的副作用。

Warm pool 只能复用干净基础环境或恢复受控快照。跨 scope 不复用带任务文件、环境变量、插件模块缓存或挂载的活进程。

## 持久化分层

| 数据 | 生命周期 | 写入方式 |
| --- | --- | --- |
| 核心会话与计划 | 长期，独立备份 | 核心状态服务；不挂入 guest |
| 插件 KV / 文档 / blob | 按 plugin + scope，插件升级前备份 | 数据服务从 worker 身份推导 namespace；不信任请求中的 pluginId |
| Agent workspace | 跨任务，保存有限 generation | 副本执行、单写租约、提交或放弃；不直接修改唯一持久副本 |
| 发布产物 | 按引用和保留策略 | 返回 opaque artifactId，元数据记录 owner、hash、mime、size、TTL |
| guest rootfs / /tmp | 单次任务 | 退出丢弃；不把沙箱根盘当成唯一业务存储 |

初始建议配额为每工作区 256 MiB、单产物 20 MiB、每租约 512 MiB scratch；这是待负载验证的起点，不是已测性能。磁盘必须有文件系统/卷层的实际限额，不能仅依赖定时计算目录大小。输入输出流另设字节数、文件数与日志上限。

小插件优先使用 RPC KV/blob，减少挂载、文件锁和升级兼容负担。确需文件数据库的插件，才单独申请独占数据卷，并设定备份、单写和迁移策略。撤回计划属于 durable job，不能藏在插件进程的 setTimeout 中。

版本清理不等于备份。备份应由 guest 无法修改的服务维护；清理仅作用于索引中登记的本产品对象。当前目录迁移必须停写/排空任务、备份、迁移并校验后一次切换，不能边运行边搬目录。

### 安全导入与导出

- 输入复制为受限普通文件；归档展开在 guest 中完成，限制总展开大小、层数和条目数。
- 不在宿主 mount guest 生成的任意文件系统镜像，不直接解压它提交的任意 tar 包。
- 文件内容经 guest RPC 以字节流导出，主机生成目标 artifactId；不采用 guest 给出的绝对路径或文件名作为写入目标。
- 禁止导出设备/FIFO/socket；处理符号链接、硬链接、路径穿越和检查后替换竞态。隔离边界由 guest 提供，拷出逻辑不能重新打开宿主文件访问面。
- 产物不在核心进程中执行。网页预览按不可信内容处理，主动内容通过隔离来源或下载方式交付。
- 文件使用跨插件 artifact grant 传递；一个插件拿到音频 ID，不代表它可以枚举其他插件产物。

### Gondolin 的持久化注意点

官方 checkpoint 是磁盘快照，不保存 RAM/进程状态；创建时停止 VM，且不包含 VFS/tmpfs。它依赖匹配的 guest assets，resume 还可能修改 qcow2 backing 路径。不能把一个 checkpoint 文件误当作包含全部工作区且永远不可变的备份。

如果采用 Gondolin，工作区由受管 VFS/独立存储维护，checkpoint 主要加速环境恢复。镜像 build ID、policy 版本和 workspace generation 分别记录。官方 Pi 示例继承宿主环境并读写挂载 cwd，不能原样用于本项目。

## 网络与凭据

默认 guest 无外网；初版通过受控能力完成模型请求、TTS 服务调用等。不把普通 Docker bridge 或设置 HTTP_PROXY 当作访问控制：能直接开 socket 就可能绕过代理。

需要 guest 网络时，由网络 namespace/运行时强制只通出口代理，代理按 profile 校验目标和预算。拒绝 loopback、LAN、link-local、元数据、IPv6 ULA 及 IPv4-mapped 地址；每次 DNS 解析、建立连接和重定向都检查，防止 DNS rebinding。

本机工作台 19335、共享浏览器 CDP 19333、Docker API、宿主代理端口都不向 guest 开放。共享浏览器拥有持续会话，不能直接给插件原始 CDP URL；以后通过限定页面、任务和目标的浏览器能力服务访问。

Bot 访问真实 Provider/TTS 的 LAN 服务，由可信能力代理使用固定上游和受限请求 schema。不能开放一个可填写任意 URL/header/body 的宿主 fetch 工具。工作区数据仍可被上传到任何已授权目标，这属于权限的实际效果。

guest 环境采用显式 allowlist，禁止扩展 process.env。LLM 凭据只在核心使用；插件若要调用外部 API，通过绑定目标、方法、路径与预算的凭据代理。日志不记录原始认证字段。插件不能通过配置或返回值扩大自身网络范围。

## Pi 接入与服务契约

保留 Pi 的 read/write/edit/bash 工具实现，使用公开 ReadOperations / WriteOperations / EditOperations / BashOperations 把 I/O 委派到沙箱。同样处理 find/grep/ls 等新增工具，禁止只包装 bash、让其他工具留在宿主。

初始 supervisor API：

| 方法 | 输入重点 | 返回重点 |
| --- | --- | --- |
| capabilities / health | 无任意宿主参数 | 实际 runtime、隔离/配额/网络特性与 ready 状态 |
| acquire | profileId、scopeId、workspaceId、generation、预算 | leaseId、guest cwd、过期时间 |
| exec / files | leaseId、guest 参数、deadline | 有限输出、退出码、操作状态 |
| artifact.export | leaseId、guest 文件句柄 | scope 绑定的 artifactId |
| commit / discard | leaseId、generation、fencing token | 新 generation 或明确失败 |
| cancel / release | leaseId、原因 | 已撤销/已停止/回收状态 |

每个服务请求用 Zod 校验，限制帧大小、输出和并发；错误区分 unavailable、policy_denied、quota、timeout、cancelled、failed。需要真实后端验证通过后再扩展 execution 配置枚举；不预先提供可用的 host 回退项。

Codemode 以后可在隔离 worker 中恢复，只允许通过 RPC 调用当前任务已授权的工具。MCP server 本身也应在受控 worker 中运行。Skills 由可信配置选择并以只读方式提供；任务自己写出的 .pi、SKILL.md 或 package.json 不能触发下一轮宿主代码自动加载。

## 上线验收

1. 宿主 /home、项目、Provider 配置、/proc 中其他进程和所有管理 socket 不可读写；路径穿越和链接不能打通拷出边界。
2. guest 对 LAN、loopback、IPv6、DNS rebinding 和重定向访问均受限；一个插件不能枚举另一个 scope 的数据。
3. 循环、内存增长、进程增长、磁盘/日志增长能被运行时限制；取消后无子进程继续写入或出网。
4. runtime 不在或安全特性缺失时只禁用执行，绝不退回宿主工具。
5. 重建 guest 后已提交 workspace 和插件数据可用，scratch 不保留；失败提交、过期 lease 与崩溃恢复不会覆盖新版本。
6. 原生 Pi 文件/编辑语义、输出截断、取消、模型 fallback 不重放副作用；direct/Docker 两种核心部署使用相同边界。

这些是功能与隔离回归，不是“证明无任何逃逸漏洞”。镜像、runtime、内核和 supervisor 仍需要固定版本及维护更新。
