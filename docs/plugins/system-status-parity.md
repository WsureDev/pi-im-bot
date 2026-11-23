# 状态插件所需的通用宿主能力

本次能力供隔离 Worker 使用，不把 AstrBot 上下文或宿主系统对象传入插件。

| RPC                 | Grant                                 | 输入与效果                                                                                                                      |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| system.status       | system.status                         | 空对象；额外要求 runtime_status。返回 CPU／内存／swap／磁盘／进程、GPU 和 Linux 多维指标，不接受路径或命令                      |
| render.html         | render.html + artifact.write          | 本次活动 Worker 私有文件相对路径和 200–2048 像素宽度；最多16MiB自包含HTML；共享浏览器禁脚本／外部请求，截图作为当前范围产物返回 |
| configuration.file  | configuration.file                    | 本实例当前 file 配置引用的 upload token、offset、length（最多64KiB）；只读分块，不接受宿主路径                                  |
| model.analyze       | model.analyze；图片另需 artifact.read | provider/model 可选、提示词、此插件图片产物ID可选；最多两次无工具模型请求，每次60秒，凭据保留在Core                             |
| delivery.configured | delivery.configured                   | manifest 声明的目标字段名、文字、幂等key；读取已保存的目标UMO，唯一匹配已登记且允许发送的范围，复用发送账本                     |

`PluginManifest.deliveryTargets` 声明可用于主动提醒的配置字段。维护定时器以实例启用状态、配置布尔开关及 intervalSeconds 管理，无群消息触发时也可执行；仅允许声明为非模型工具的操作。实例维护上下文只授权自己的操作与 runtime_status，普通 `delivery.send` 禁止使用，提醒只能走声明的配置目标。关闭主服务时先取消并等待定时维护，再关闭持久运行时和Worker。

`ConfigField.type=file` 支持 PNG/JPEG，原 `file_types` 元数据保留。控制台 multipart 上传至 `/api/plugins/:id/configuration/files`，body上限6MiB、单文件上限5MiB；返回实例独立的内容摘要token。用户在插件配置页直接上传、移除、保存；并非把文件路径藏入开发者配置。实例文件不提供给其他插件。该版本暂只为图像file字段提供格式支持。

`/status` 可由已启用插件声明；未配置插件时保留内置回退。核心会话状态始终可使用 `/botstatus`。help、stop、new、skills等核心控制指令仍保留，不开放任意覆写。

## 机器指标

Linux采集参考本机 Cockpit 337 的 `channels/metrics.py` 与 `samples.py`，独立TypeScript实现：

- `/proc/stat`：汇总／逐核 user、system、nice、iowait、总利用率；guest不重复计数。
- `/proc/meminfo`：available/free/cache/buffers/swap，内存已用采用total-available。
- `/proc/diskstats`：512字节扇区换算，物理盘吞吐、IOPS、busy；汇总排除分区、dm、md，避免重复计数。
- `/proc/net/dev`：逐接口累积字节、错误、丢包以及差分速率。
- `/proc/mounts`＋statfs：本地设备挂载点、总／已用／可用；不接受用户指定读取路径。
- `/sys/class/hwmon`：温度和标签；`/proc/pressure`：CPU、memory、I/O压力。
- 固定参数nvidia-smi与AMD DRM/sysfs：设备、VRAM、利用率、温度、功耗。AMD产品名通过受限PCI地址查询lspci。

普通指标采样有缓存和读预算；procfs短读必须持续读取至EOF，不能把第一页误认为完整CPU或网卡清单。差分基线缺失或计数器回退时，速率为null。GPU缺失是明确不可用，不能伪造0。扩展的Linux诊断包含设备与挂载点名称／路径；不包含IP、环境、配置正文或凭据。

图片描述默认模型在Bot设置中直接可选；插件配置优先，留空继承当前范围默认图片模型，再回退当前模型组。图片分析只允许该插件生成的当前聊天产物。

实际生产迁移前需要取得原配置只读导出、确认目标UMO和所需Worker变更。配置／文件上传、通用渲染与自编Worker测试不能代替真实QQ提醒或真实模型服务验收。
