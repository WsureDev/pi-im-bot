# 插件数据、产物额度和自定义切入点

本页的验收开关和依赖状态描述对应历史阶段；当前部署状态以在线诊断为准。2026-11-12 部署记录已启用，2026-11-13 只读观察确认 enabled:true；本轮源码修复未部署。详见 [审核修复记录](review-remediation-2026-11-12.md)。

第四阶段 D 收尾存储和扩展运行机制。四个授权临时 Docker 容器已验证实际文件隔离、硬容量上限、定向终止和重建持久性，并已清理。该阶段验收时正式插件执行后端关闭。

## 固定容量持久卷

普通 bind 目录无法硬性限制写入。本实现使用固定容量 ext4 镜像，由系统 fuse2fs 挂载，满额时返回 ENOSPC。插件在私有目录中仍可使用普通文件、目录及业务数据结构。

`bot.json.plugins.storage` 默认每卷 64 MiB、每插件 1024 MiB、全局 8192 MiB、最多 128 卷。额度按镜像逻辑大小预留，不能用稀疏文件超配。相同实例/聊天范围跨版本共用卷，不同实例/范围分开。配置变化不自动缩放已有镜像。

```text
plugins/<instance>/<revision>/                 固定代码
plugin-data/<deployment>/volumes.json           卷目录及预留
plugin-data/<deployment>/<instance>/<scope>/volume.img
plugin-data/<deployment>/views/<instance>/<scope>/files/
                                                FUSE 挂载
data/artifacts/                                 已发布产物
data/plugin-runtime/                            受管入口与 RPC
```

容器只得到只读父视图 `/data`，其中 `/data/files` 是限额可写子挂载。镜像和账本位于视图外。Docker 的 ReadOnlyNonRecursive 保留子挂载可写性，要求 API ≥ 1.44；不能写父目录绕过容量限制。

OCI 初始化会用 root 检查工作目录，而默认用户态 FUSE 只向所属 UID 开放。容器先在 `/tmp` 启动，再由 SDK 以容器用户进入 `/data/files`，通过 `context.dataDir` 提供路径。实际容器测试已验证此布局，不需要修改 `/etc/fuse.conf`。

直接部署需要 Linux、可访问的 `/dev/fuse` 及 mke2fs、e2fsck、fuse2fs、fusermount3。工具路径可配置，缺失时不回退普通目录。本机验收使用校验后的 Debian 包提取工具，没有安装或替换系统包。

创建先持久预留，再创建和格式化镜像，完成后登记 ready。创建中断或检查不能修复会隔离并继续计入额度，不自动换空卷。fuse2fs 不写 journal，所以镜像明确关闭 journal；重新挂载前执行 e2fsck 检查，正常关闭先停 Worker 再卸载。这不替代业务事务与备份。

## 大文件与统一产物额度

```js
const artifact = await context.host('artifact.publish', {
  path: 'output/report.pdf',
  name: 'report.pdf',
  mimeType: 'application/pdf'
})
return { text: '报告已生成', artifactIds: [artifact.id] }
```

operation/handler 和实例均需 artifact.write 授权。路径相对本次活动数据目录；核心逐段通过目录描述符打开，不跟随符号链接，只接受普通文件。发布按 64 KiB 复制并计算摘要，不把二进制放入 RPC 帧或模型上下文。文件变化或取消会拒绝并清理 staging；应先关闭文件写入。

ArtifactStore 对所有生产者统一预留、复制和提交。插件的 MCP 连接器产物也归属该插件。默认单文件 256 MiB、每聊天范围 1 GiB/512 项、每生产者 2 GiB/1024 项、全局 8 GiB/4096 项、并发写入 8；配置位于 bot.json.artifacts。

旧产物先登记，不自动删除。中断的 staging 恢复时核对完整元数据/文件，完成的保留，未发布的清理并释放额度；损坏账本不会按空账本处理，孤立二进制仍占额度。达到上限拒绝新写入。

Web「插件数据与产物额度」显示预留、历史使用测量、依赖状态和写入数。核对只释放已不存在文件的额度，不删除现有数据。

## 插件自定义切入点

operation 可触发自己声明的 point，其他插件按版本化定义注册 handler。例如拥有者声明 prepare@1，输入/输出为 prompt 对象，可写字段仅 /prompt；operation 和实例授权 point:plugin.self.prepare@1：

```js
const prepared = await context.host('point:plugin.self.prepare@1', {
  value: { prompt: input.prompt, target: 'QQ' }
})
```

集成插件使用 plugin.<拥有者实例>.prepare@1，或通过显式依赖别名解析。调用方不能手工冒充核心事件或别的插件生命周期。范围、触发上限、当前权限、优先级、依赖、期限和字段边界继续生效。

- transform：返回带 inputRevision 的 patch，完整值校验后原子应用。
- collect：逐项校验，返回 contributions（含 source/value）和 omitted 数量。
- select：第一个非 null 的有效结果获选。
- policy：固定 allow/deny，拒绝不能被后续允许覆盖。
- exclusive：配置只允许一个处理器，必须产生有效结果。
- observe：返回 accepted/eventId，事实交给持久观察队列。

外来 schema 仅在专用验证 Worker 编译执行。它不导入插件入口、没有宿主能力、没有私有数据挂载，使用独立名额和内存限制。业务 Worker 等待自己的契约验证不会回调自己。默认每 point 32 个 handler、256 KiB 输入/结果、10 秒总期限；单次验证最多 3 秒。病态正则测试验证了超时和其他能力响应。

输入、完整变换值和输出均校验，失败 patch 不保留部分修改。贡献者不能取得 owner 设置或修改投递身份/目标。

## 部署与备份

提供 Dockerfile 和 compose.yaml，Compose 结构检查通过，未构建或部署正式 Bot 容器。Bot 控制面持 Docker socket，是受信进程；第三方 Worker 不取得 socket。

Docker 部署需设置 hostPackageDir、hostDataDir、hostRuntimeDir 对应真实宿主路径；plugin-data bind 需 rshared。可信 Bot 容器需要 /dev/fuse 和 SYS_ADMIN 建立挂载，权限不传给插件。空配置目录从独立 defaults 目录生成示例。

备份要包含配置、Bot data、固定 plugins 快照、plugin-data 镜像/账本；卷应在停 Worker 并卸载后复制。删除实例配置不自动删除历史数据。卷扩缩容、数据删除和通用业务迁移未开放自动 API。

真实验收使用已有镜像，宿主文件/环境不可见，根/代码/父视图不可写，跨群/实例不串用，32 MiB 卷写满拒绝，纯验证器不导入 owner 代码，死循环定向终止，重建数据保留。具体授权范围见验收计划。

该阶段验收时正式执行关闭。Telegram、知识库和实际领域插件迁移继续推进，整体框架目标尚未完成。
