# 执行隔离与插件架构

调研日期：2026-11-08。本文件保留早期隔离调研。现已复用 Shipyard，允许容器内全部路径与 Shell、关闭宿主执行，当前实现见 [README](../README.md#pi-能力与工作区)。框架设计已重新展开，新的规范草案见 [Bot 框架设计](framework/README.md)；下文的运行时选型与初期插件假设不代表新的实施范围。

## 决策

保留 Bun / TypeScript Bot 与 Pi，增加独立的执行服务和明确的插件协议。Bot 负责入口、权限、上下文、Provider、状态与交付；Pi 负责推理和工具循环；插件和生成代码在各自隔离环境中执行。

首版只实现一个执行后端，优先验证 **gVisor + 专用 rootless 容器引擎**。验证不通过就保持执行关闭，不自动换成普通 Docker 或宿主 Shell。**Gondolin** 是与 Pi 最贴近的 microVM 候选，作为后续独立适配，不同时建设两套运行时。

如果部署方要求把执行环境失陷的影响也移出用户电脑，执行服务部署在独立机器，或先放入专用 Linux VM。软件隔离无法承诺绝对零逃逸；单独进程、工作目录、路径过滤和普通容器也不能提供同等边界。

实施顺序：关闭宿主执行 → 沙箱和数据生命周期 → 插件 RPC → TTS / 撤回验证编排 → 更多插件和平台。当前不引入 Kubernetes、可视化 DAG 编辑器或另一套 Agent 引擎。

## 当前风险与已做修改

原来的工作区路径只是 Pi 的 cwd。read/write/edit/bash 在 Bot 进程的账户权限下操作宿主文件；Codemode、MCP、扩展加载与旧会话工具恢复还会增加绕过入口。当前账户属于 docker 组，宿主 Shell 的权限影响尤其大。

现在 execution.backend 只接受 disabled。仅注册限定到当前会话的聊天和计划任务工具；关闭宿主文件、Shell、Codemode、MCP、Skills 与磁盘扩展自动发现；恢复会话后重新设置精确工具集合，并检查实际注册表。网页和 /status 展示执行尚未配置。

这是能力收缩，不是已经获得了 OS 沙箱。Bot 本身仍是可信进程，仍可读写自身配置和状态；恶意依赖或核心服务漏洞不由这次工具禁用解决。下一步应使用独立服务账户，避免 Bot 继承个人账户的目录和 Docker 权限。

边界回归使用本地假 Responses 服务：恢复旧工具会话，尝试读取/改写工作区外哨兵文件、执行 Shell/Codemode，并放置会被自动发现的扩展/MCP 配置。验证这些入口不执行，同时聊天历史工具仍可工作。它不属于内核逃逸测试。

## 现成方案

| 方案 | 可直接复用的部分 | 边界与成本 | 本项目判断 |
| --- | --- | --- | --- |
| gVisor / runsc | OCI 运行时、系统调用隔离、容器镜像生态 | 用户态内核；不是完整 Linux guest VM；要验证 Bun/Node、ffmpeg 等兼容性，以及网络和 cgroup 配额 | Linux v1 首选验证；独立服务账户与引擎，禁止接现有生产 Docker |
| Gondolin | TS SDK、QEMU microVM、VFS、网络策略、凭据替换、磁盘 checkpoint；Pi 官方有适配示例 | 项目仍标 experimental，ARM64 测试最充分；官方明确没有完整 DoS 治理；Bun 宿主兼容性未验证 | Pi 适配最自然的 microVM 备选；先验证 x86_64、镜像和资源控制 |
| Docker Sandboxes / sbx | 本地 microVM、策略、凭据代理、Pi kit | 当前本地 Linux 官方支持 Ubuntu 24.04+，需要 KVM 和登录；本机是 Debian 13；公开应用 SDK 主要面向云端 | 适合个人 Pi 开发环境；不先作为无头 Bot 的默认管理依赖 |
| OpenSandbox | 生命周期、exec/files API、TS SDK、Docker/K8s 后端 | 管理平台不是隔离机制；本地示例为 Python 服务 + Docker，Firecracker 快速沙箱当前说明面向 K8s | 规模扩大后可接；首版管理面和依赖偏重 |
| 现有 Shipyard Neo | Sandbox/Session/Cargo、持久卷、TTL/GC、能力路由 | 本地实现默认 Docker，未验证强隔离运行时；主要为 Python 控制面 | 复用计算/存储分离的设计；不因已有部署就认为满足隔离要求 |
| Anthropic sandbox-runtime / srt | TS 库，Linux bubblewrap，进程树文件和网络策略 | Research Preview；默认读取范围广，需要显式收窄；共享宿主内核，额外补资源和持久化管理 | 轻量直接部署候选，不能用默认配置承载任意第三方插件 |
| NVIDIA OpenShell | 文件/网络/进程策略、凭据代理，Pi 官方有接入方法 | 是另一套 gateway 和执行策略平台；当前文档 v0.1.7 | 保留为外部服务适配方向，本轮未完成部署/生命周期核验 |

不要把“生命周期管理平台”和“隔离执行机制”混为一谈。OpenSandbox / Shipyard 可以管理多种底层环境；真正的边界取决于运行时、挂载、网络和管理权限。

### 本机适配事实

- 系统为 Debian 13、x86_64。PATH 中有 Docker、bubblewrap、unshare、systemd-run；未找到 runsc、Podman、QEMU。
- 宿主 /dev/kvm 存在，权限是 root:kvm 0660；当前账户不在 kvm 组。尚未验证通过 ACL 或其他方式访问 KVM，不能按“没有 KVM”或“microVM 已可运行”作结论。
- 对现有 Docker 只做了只读运行时查询，未发现 runsc。没有安装运行时、变更用户组、重启 daemon 或修改现有容器。
- gVisor 默认 systrap 不依赖 KVM。专用 rootless 引擎仍需验证 user namespace、subuid/subgid、cgroup v2 委派与网络隔离。
- 不能直接使用 runsc --rootless 作为完整部署：官方文档列出该模式不支持 create、save/restore，且外网连接需使用宿主网络等限制。计划采用由 rootless 引擎配置 user namespace 的方式。

## 运行拓扑

~~~mermaid
flowchart LR
  I["QQ / TG / Mock"] --> C["Bot 控制面<br/>入口、策略、调度、状态"]
  J["Cron / 指令"] --> C
  C --> P["Pi SDK<br/>上下文、压缩、工具循环"]
  P --> L["Provider 与凭据<br/>可信核心"]
  P --> B["能力代理<br/>scope、deadline、配额"]
  C --> B
  B --> S["独立执行服务"]
  S --> A["Agent 沙箱<br/>文件与 Shell"]
  S --> W["按插件隔离的 Worker"]
  C --> D["呈现编排 → Outbox → 渠道"]
  D --> E["交付回执 → 异步订阅者"]
~~~

本地直接部署与 Bot Docker 部署使用同一执行服务协议。区别仅在核心进程如何打包，不改变权限边界。核心容器不挂 Docker socket；执行服务也不能把其管理 socket 传入任何 guest。

详细约定见 [沙箱与持久化](sandbox-runtime.md)、[插件与流程编排](plugin-runtime.md)。

## 按资源约束拆分实施

| 阶段 | 可交付范围 | 验收重点 |
| --- | --- | --- |
| P0：已完成代码修改 | 默认关闭所有宿主执行入口，保留 IM/Provider/计划工具 | 旧会话、扩展发现和模型伪造工具调用不能恢复执行；离线协议回归通过 |
| P1：执行后端 | 一个专用 supervisor、一个 runtime、Pi 操作适配、独立工作区和产物 | 宿主路径/凭据不可见、guest 不通 LAN/管理接口、取消杀整个任务、超额回收、重启恢复工作区 |
| P2：插件最小闭环 | manifest、RPC、能力授权、独立 worker、数据 namespace、deadline | 一个插件挂死不拖垮其他插件或会话；包版本可切换，失败可回滚 |
| P3：编排验证 | 结构化 ReplyDraft、TTS presenter、outbox/receipt、撤回订阅者 | TTS 超时降级文本；撤回跟随真实消息 ID；发送结果未知不盲目重发 |
| P4：扩展 | TG、更多媒体、受控 Skills/MCP、异步长任务、管理页面 | 新能力沿已有接口接入，不能重新开放宿主执行旁路 |

初始并发沿用 2 个 Agent 任务。Warm pool 最多预热干净镜像；执行过任务的实例不能清理几个文件后复用给另一 scope。首版以小规模复制工作区实现版本化，达到实际瓶颈后再做 reflink/COW 优化。

隔离本身不增加 LLM token；工具 schema、上下文、错误重试与额外 agent 轮次才增加 token。保持 Pi 原生工具语义，按任务选取插件能力；TTS、撤回、交付和 GC 均不应额外调用 LLM。暂不声称与 AstrBot 有确定用量差值，需要同模型/同任务实测。

## 调研来源

本轮阅读的是 2026-11-08 可访问的官方文档及本地代码；动态项目的能力需在实施时固定版本重新核对。

1. [Pi 隔离指南](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/docs/containerization.md)；本项目安装的 v1.5.0 工具操作接口。
2. [gVisor 安全模型](https://gvisor.dev/docs/architecture_guide/security/)、[Rootless](https://gvisor.dev/docs/user_guide/rootless/)、[平台](https://gvisor.dev/docs/user_guide/platforms/)、[网络](https://gvisor.dev/docs/user_guide/networking/)。
3. [Gondolin 仓库](https://github.com/earendil-works/gondolin)、[安全设计](https://earendil-works.github.io/gondolin/security/)、[限制](https://earendil-works.github.io/gondolin/limitations/)、[快照](https://earendil-works.github.io/gondolin/snapshots/)。
4. [Docker Sandboxes 安装](https://docs.docker.com/ai/sandboxes/install/)、[安全模型](https://docs.docker.com/ai/sandboxes/security/)。
5. [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox)。
6. [Shipyard Neo 本地 fork](../../shipyard-neo-astrbot/README.md)，重点参考 Sandbox/Session/Cargo 分离。
7. [Anthropic sandbox-runtime](https://github.com/anthropics/sandbox-runtime)。
8. [NVIDIA OpenShell](https://docs.nvidia.com/openshell/about/overview)。
