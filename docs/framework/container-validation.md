# 插件真实容器验收

> Historical validation note: ${VALIDATION_DIR} is a placeholder, not a published location. Local logs, patches and orchestration inputs are not included in this Git repository.

本页的验收开关和依赖状态描述对应历史阶段；当前部署状态以在线诊断为准。2026-11-12 部署记录已启用，2026-11-13 只读观察确认 enabled:true；本轮源码修复未部署。详见 [审核修复记录](review-remediation-2026-11-12.md)。

状态：已获用户授权，四个临时容器完成实际验收并清理。首次发现 OCI 工作目录检查与用户态 FUSE 权限的差异，改为 SDK 进入数据目录后重试通过；结果见本阶段实验归档。

验收脚本和结果归档于 `local-archive:2026-11-09/pi-im-bot-plugin-storage/`。脚本不加参数只生成本地测试包和计划，不创建容器；`--run` 才执行真实容器操作，复跑仍须核对授权名称和数据目录。

只管理以下四个新容器名称，可创建、启动、停止、删除，并为持久性测试重建相同名称：

```text
pi-im-plugin-ee8cef69-60b633567720b6e761bc
pi-im-plugin-ee8cef69-2b9bc72c56465016340a
pi-im-plugin-ee8cef69-2793aedc6dec2d4bc5c5
pi-im-plugin-ee8cef69-b3ab82ebd96ca142aa6a
```

使用本机已存在的 `oven/bun:1.4.4`，镜像 ID 为 `sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d`。每个容器内存上限 128 MiB、0.5 CPU、64 个进程，关闭网络，根文件系统只读，去除 capabilities，禁止提权，不挂载 Docker socket 或 Bot 配置。每个数据卷为 32 MiB 固定容量文件系统。

宿主测试内容仅在 `${VALIDATION_DIR}/real/` 中，使用自行编写的测试插件和占位环境值，不调用真实模型、MCP 或 QQ。验证包只尝试访问自己的宿主测试哨兵文件，不尝试修改真实项目或用户文件。

验收内容：

1. 不继承宿主环境，不能看到未挂载的宿主哨兵文件。
2. 不能写根目录、插件代码或数据卷外的只读视图目录。
3. 数据卷满时拒绝写入；跨实例、跨群数据不混用。
4. 独立 schema Worker 不导入插件入口，也不挂载私有数据。
5. CPU 死循环可被定向终止，另一个插件仍响应。
6. 删除并重建 Worker 后数据保留，测试结束清理这些容器并卸载自有文件系统。

挂载使用只读父视图与可写 FUSE 子挂载，`ReadOnlyNonRecursive` 需要 Docker API 1.44 及以上；本机已只读确认 API 1.53。镜像文件在父视图外，不向插件暴露。该设计避免要求修改 `/etc/fuse.conf`。

授权范围不包含现有容器，也不包含正式插件后端启用、正式配置修改、镜像拉取或构建。每次容器变更仍输出具体名称和 Container Change Notice。上述临时验收已通过；该次验收时正式执行后端保持关闭，授权范围未包含启用。
