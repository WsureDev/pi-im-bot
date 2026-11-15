# 插件中心、配置 schema 与分发设计

状态：2026-11-09 设计基线；首批正式管理、schema 配置、安装与分发已经实现，实际范围和使用方式见 [插件中心实现](plugin-management.md)。本文件保留完整设计目标，未实现部分以实现记录为准。

交互样例：运行 `bun run preview:plugins`，访问 `http://localhost:19336`。使用 GSVI 语音、延时撤回、异步图像工作室三个示例，操作仅在浏览器保存。原型没有下载、执行或调用任何真实插件、模型与服务。

## 1. 这次需要改掉什么

现有插件页把运行时配置直接当成了产品界面：

- 普通用户要先编造实例 ID、填写宿主源码目录，再手动导入快照；没有正常的获取与安装流程。
- 业务参数、宿主授权、依赖实例和 MCP 映射都是 JSON 文本框。用户需要理解内部 RPC 命名才能配置功能。
- 所有 settings 顶层字段都被占位遮住，普通偏好也无法直观编辑；没有按 schema 逐字段区分秘密与普通值。
- manifest 的 `configSchema` 只在业务 Worker 收到调用时校验，保存配置时不能发现错误。状态 `configured` 不代表可执行。
- Worker、观察任务和磁盘卷排在功能卡片前面，安装与配置被诊断信息淹没。
- 缺作者、文档、来源、兼容性、更新记录和版本操作，尚未形成可分发的插件包产品。

运行隔离、Job、回执和切入点边界继续作为底座。下一阶段首先补齐插件从作者发布到用户使用的完整路径。

## 2. 实际参考了哪些实现

| 来源 | 核对内容 | 采用的部分 |
| --- | --- | --- |
| AstrBot v4.28.0 配置文档和字段组件 | `_conf_schema.json`、中文描述、提示、默认值、object、list、dict、file、secret、slider、template_list、资源选择器 | 声明式配置文件及自动表单，插件作者不必写前端 |
| AstrBot 安装列表与插件详情 | 市场/已安装分离、配置入口、启停、更新、README、更新日志、指令说明 | 围绕安装与使用组织管理页 |
| AstrBot 社区发布文档 | GitHub 仓库、插件集合目录、社区索引 | 先用静态索引与既有代码托管，无需自建完整市场服务 |
| Koishi 配置控制台 | 插件配置树、多份配置、过滤器、依赖与服务缺失提示 | 包与实例分开；作用范围和依赖可解释 |
| Koishi 市场安装器 | npm 包目录、版本与兼容性、包名解析、依赖安装 | 标准包元数据、固定版本与安装状态；npm 可作为后续来源 |

AstrBot v4.28.0 的 `secret` 明确主要负责前端遮罩，不表示接口不返回原值或磁盘加密。我们的凭据保留机制要在服务端按叶子字段实现。AstrBot 更新 schema 时会增默认项、删除消失项；这里采用显式迁移与保留旧配置，避免升级无意丢值。

Koishi 的 schema 可以由插件 JS 导出；我们的核心不能为获取表单而 import 插件代码。采用发布时生成的静态 schema。只借鉴交互和协议约定，组件独立实现；现有 AstrBot/Koishi 插件代码需要迁移后才能运行。

外部文档与市场页经共享浏览器访问超时；以上结论来自下载并核对的固定版本源码、文档和本地实际插件 schema，没有把网站截图当作验收证据。

## 3. 用户看见的插件中心

主导航单独提供「插件中心」，MCP 与 Skill 仍是各自的资源。

| 页面 | 用户要做的事 | 主要内容 |
| --- | --- | --- |
| 发现插件 | 找到并获得一项能力 | 搜索、分类、渠道兼容性、作者、版本、说明、安装；支持链接、压缩包和开发目录入口 |
| 已安装 | 管好正在使用的插件 | 名称、功能摘要、主要状态、生效范围、配置、启停、可用更新；详细操作收进更多菜单 |
| 插件详情 / 配置 | 填好业务参数 | 分组表单、资源下拉、字段说明、即时校验、默认值、范围覆盖、未保存修改 |
| 插件详情 / 能力与范围 | 明白插件会做什么、在哪里工作 | 工具、指令、处理器、所需服务、允许影响的数据、启用的群/私聊/Mock |
| 插件详情 / 执行顺序 | 调整同一阶段内的协作 | 当前范围的有效顺序、依赖、优先级、冲突原因和恢复继承 |
| 插件详情 / 版本与数据 | 更新、排错、卸载 | 来源、固定版本、README、更新日志、配置变化、依赖、数据用量和卸载选项 |
| 运行诊断 | 解决环境与运行问题 | 执行后端、Worker、错误、任务、观察队列、数据和产物额度 |

### 安装与第一次使用

选择插件 → 看功能、版本和所需资源 → 安装发布包 → 自动建立一份默认配置 → 填必要参数、绑定资源、选择范围 → 启用。

实例 ID 自动生成。用户主要看到「GSVI 语音」或自己起的配置名称。创建第二份配置属于更多操作，允许例如两个绘图后端分别绑定不同群；通常只需要一份。

列表状态优先解释当前阻碍：下载中、配置待补、依赖未就绪、执行环境未启用、已停用、已启用、运行异常。安装、配置有效、依赖可用、全局启用、范围选中、触发授权分别保留事实，详情可以展开原因。Worker 空闲被回收不等于插件故障。

启用开关只控制该实例是否参与新请求。缺少必需配置或依赖时给出明确修复入口；插件缺失语音服务不会挡住别的插件或整个 Bot。

### 配置与范围

实例基础配置 → 账号覆盖 → 群/私聊覆盖 → 当前 conversation 覆盖。群员仍共用同一份偏好，不增加个人 user 状态。

详情顶部选择「实例默认 / 某账号 / 某群 / 当前会话」。支持覆盖的字段显示「继承实例/上层配置」、当前值及来源，取消继承后编辑；恢复继承删除覆盖值，不能写回默认值冒充继承。空字符串、空列表和 false 都是实际覆盖。

服务地址、凭据与核心资源绑定默认只允许在实例层配置。音色、概率、绘图预设等偏好由作者显式允许在群层覆盖。群名单由框架的范围选择维护，插件无需再造一份 `group_whitelist`。

## 4. 底层只保留四个清晰概念

| 对象 | 归属 | 内容 |
| --- | --- | --- |
| Package | 作者与社区 | 稳定包 ID、名称、作者、说明、图标、文档、分类、来源 |
| Release | 包的一次发布 | 版本、兼容范围、构建后入口、schema、能力声明、文件与完整性摘要 |
| Instance | 本地操作者 | 选用的 Release、基础配置、资源绑定、授予的能力、全局开关 |
| Scope binding | 既有框架设置 | 某账号/群/conversation 是否选择此实例，以及参数、处理器与优先级覆盖 |

Scope binding 直接接到现有设置解析器，避免再维护一套相互矛盾的群开关。数据继续按实例与聊天范围持久保存，升级版本不改变数据归属。

## 5. 配置 schema 直接沿用 AstrBot 的写法

作者放一个 `_conf_schema.json`，另有实际配置值文件，两者分开。这个文件描述业务配置；工具参数继续使用 operation 的 JSON Schema，宿主能力声明也独立保存。

```json
{
  "voice": {
    "type": "string",
    "description": "音色",
    "hint": "本群成员共享此音色。",
    "default": "花火",
    "options": ["花火", "三月七"],
    "scope": ["instance", "room", "conversation"]
  },
  "probability": {
    "type": "int",
    "description": "触发概率（%）",
    "default": 100,
    "slider": { "min": 0, "max": 100, "step": 1 },
    "scope": ["instance", "room"]
  }
}
```

### 控件与字段

| AstrBot 约定 | 本项目控件 / 语义 |
| --- | --- |
| string / text | 单行 / 多行文本 |
| int / float + slider | 数字框与滑块；边界和 step 同时用于服务端校验 |
| bool | 开关 |
| options / labels | 下拉单选、多选或复选组；保存原始值，显示中文标签 |
| object + items | 分组与嵌套表单 |
| list | 标签、逐项编辑、可排序列表；不会退回要求用户写 JSON |
| dict + template_schema | 键值行与可选键模板，保留每项类型 |
| template_list + templates | 选择模板 → 添加命名项 → 折叠编辑、排序、删除；保留 `__template_key` |
| secret | 已设置状态、替换、清除；普通 GET 不返回原值 |
| file + file_types | 上传与文件引用；只返回受管文件 ID，不给宿主路径 |
| description / hint / obvious_hint | 字段标签、就地说明、必要提示 |
| condition / invisible / readonly | 声明式显示和编辑条件，不执行 JS；隐藏不等于取消权限 |
| editor_mode / editor_language | 仅复杂代码/模板字段使用编辑器，不能把整份配置塞进编辑器 |
| _special | 选择已登记的模型、MCP、Persona 等资源；返回稳定 ID |

新增 `scope` 声明可覆盖层级；默认只允许实例层。原型实现其中 string/text/int/float/bool/object/list/template_list、下拉、滑块、条件显示和部分资源选择；dict、file、完整资源查询与服务端能力管理还属于正式实现范围。

`_special` 使用框架注册的选择器，插件不能提供任意执行函数。未实现的服务类型应显示缺少能力；不能把聊天 Responses provider 当作已经支持语音或图像 Provider。

资源需求声明关联到相应配置字段，例如 `images` 连接器从 `backend` 字段解析。用户只选择一次资源，框架从该引用生成底层连接器映射，不再要求另外填写一份 connectors JSON。

模板列表作为一个字段整体覆盖，避免按数组下标继承，改名、排序和删除后不串项。condition 隐藏字段不自动删值，切回选项保留草稿。刷新音色、测试连接属于显式操作按钮，不能再用「勾选后执行一次并自动复位」的业务配置开关。

### 校验、凭据与配置更新

1. 导入先检查 schema 的类型、体积、深度、字段数量和支持的语义；安装和展示 schema 不执行插件入口。
2. 相同 schema 生成表单与运行验证结构，作者只维护一份配置声明。UI 控件不能成为唯一校验层。
3. 保存时服务端检查字段、范围、资源引用与当前版本；错误定位到具体字段。复杂自定义校验仍放到有界验证 Worker，不能在核心执行不受限正则或第三方代码。
4. 普通字段原样返回。secret 叶子单独返回已配置状态，写入使用 keep/set/clear 的明确动作，列表中的秘密用稳定项 ID 管理，不能依赖 `******` 字符串或数组下标。
5. 保存带实例配置 revision、Release 和 schema 摘要。旧页面不可覆盖新配置。新配置通过校验后原子激活，新任务使用新快照，在途任务保留旧快照。
6. 新增字段补默认值；删字段、改类型和凭据变化保留旧版本配置及差异。不能静默删除用户设置，也不能把无效配置标为已启用。

## 6. 把能力边界变成可解释的声明

插件声明两组内容：**提供什么**和**需要什么**。由框架解释声明、生成能力页面、绑定列表及现有底层 grant，普通用户不用手写授权字符串。

- 提供什么：LLM 工具、指令、上下文来源、文字处理器、呈现器、回执/消息观察器、版本化服务或自定义 point。
- 需要什么：当前群历史、产物发布、指定的 MCP/HTTP/模型能力、特定插件服务、安排撤回等。必需与可选依赖分开，每项附用途说明及契约版本。
- 能影响什么：具体投影、point、可写字段、产物和动作；不暴露共享可变 Bot/Pi 对象。
- 在哪里工作：实例、已选择聊天范围和当前可信触发人。包要求的能力、实例允许的能力、范围选择及触发权限共同约束。
- 用多少资源：运行时负责期限、并发、磁盘与产物额度，作者不能靠改 schema 自行扩大额度。

插件自己的文件卷属于部署边界。不能仅展示 `storage.read/write` 开关就声称已经限制了插件内部普通文件访问；卷的挂载方式与容量必须真正由运行时实现。只读宿主钩子也不能被解释为插件私有缓存绝对不可写。

第一步继续用现有 MCP connector 与 operation RPC。通用 HTTP、语音服务等新连接器要另行实现受管契约，明确目标与凭据保管，不给插件通用宿主 fetch 或任意 URL 代理。

执行顺序页只能调整同一切入点中的处理器，展示 before/after/requires 和最终顺序。无法通过 UI 优先级把撤回放到发送之前。呈现器按选择链首个可用结果接管，工具收纳则是一个排他选定策略，分别表达。

## 7. 获取和分发先用成熟托管

推荐先实现「一个静态社区索引 + GitHub Releases 的预构建发布包 + ZIP 导入」。包名和元数据保留 npm 命名方式，后续增加 npm tarball 解析来源；现阶段不自建账号、评分、评论或全功能包管理站。

用户可以通过市场卡片、仓库/发布链接、上传包获取插件。仓库链接自动解析兼容的已构建 Release 并固定到版本和摘要；没有发布产物时明确提示，不在宿主临时构建。开发目录入口放到开发者选项，不再成为安装的默认路径。各入口共用 SourceResolver → Release staging → 校验 → 固定快照 → 创建/更新实例。

作者仓库建议结构：

```text
package.json             包名、作者、版本、仓库、许可证、开发构建脚本
src/                     TypeScript 实现
_conf_schema.json        声明式业务配置
README.md / CHANGELOG.md  使用说明、变更记录
assets/                  图标与声明的资源
dist/plugin.mjs          发布时生成的 Worker 入口
plugin.json              发布时生成/检查的能力和文件声明
```

消费者安装的是构建好的发布包。依赖由作者构建阶段打包进产物；Bot 不在宿主运行第三方 `install/postinstall/build`，也不把插件依赖装到核心 node_modules。需要额外运行环境的包明确声明兼容要求，不在安装时临时改宿主。

索引只需 Package ID、展示元数据、发布版本、Bot/SDK 兼容范围、渠道、下载地址、文件大小和摘要。缓存可离线浏览，来源不可用时保留已安装版本。摘要校验用于固定发布内容，不能替代执行隔离。

ZIP/tarball 解包按现有 2000 文件、单文件 16 MiB、总量 64 MiB 等实际预算流式限制，拒绝路径越界、符号/硬链接和特殊文件；不能先完整解包再检查额度。下载与解包进度是管理任务，不占群主 conversation，也不产生模型调用。

更新先准备新 Release 并显示新增能力、依赖与配置差异，再原子切换。失败保留当前版本。回滚代码不等于业务数据兼容；涉及数据迁移时单独保存和检查数据。卸载默认保留配置、私有数据与产物，数据清理是独立且可定位的操作。

## 8. 三个样例覆盖不同形态

| 样例 | schema 要验证的交互 | 能力边界 |
| --- | --- | --- |
| [GSVI 语音](plugin-examples/voice/_conf_schema.json) | 资源引用、嵌套偏好、下拉、概率滑块、群覆盖、仅实例字段 | 呈现阶段产生音频；不改模型原文、不直接拿平台对象发送 |
| [延时撤回](plugin-examples/recall/_conf_schema.json) | 开关条件、时间参数、手动操作偏好 | 回执后安排持久动作，不持有主会话或 Worker 倒计时 |
| [图像工作室](plugin-examples/image-studio/_conf_schema.json) | MCP 绑定、多类型 template_list、命名预设、提示词、多后端 | 工具和指令共用 operation，异步提交/查询/取消交给 Job |

这些是供表单与流程讨论使用的配置样例，不是已经移植的业务插件。尤其 GSVI 的通用语音连接器仍需实现。

## 9. 落地次序与验收

1. **先把现有配置做对**：静态 schema 导入、统一字段验证、默认值、服务端秘密保留、作用范围，以及真实已安装列表和详情。移除常规页面的 JSON 参数与映射输入；无 schema 的插件明确显示无配置或不支持可视化配置。
2. **再补完整获取流程**：ZIP 与 Release 链接、固定版本、安装任务、静态目录源、更新与回滚、README。用户完成安装不用知道服务器目录。
3. **形成作者工具链**：SDK 模板、构建/打包/校验命令，从一份操作定义生成工具和指令元数据；带完整配置和后台协议的真实业务样例。再扩 npm 来源、多份配置与更多受管服务。

验收以用户任务为单位：从目录安装并配置一个插件；只改某群音色而不影响其他群；配置错误在保存时定位；密钥在刷新和导出时不泄漏；缺依赖只影响依赖它的能力；调整优先级看到有效顺序；更新失败仍使用旧版本；卸载后数据有清晰去向。原有隔离、超时、异步任务与防重放回归继续保留。

本轮原型已验证安装样例、搜索、schema 控件、服务绑定、群覆盖与继承、能力说明、同点优先级、模板新增编辑与刷新保留，以及卸载保留配置。桌面与 390 px 手机布局通过。正式后端改造按上述次序推进。

## 可核对来源

- [AstrBot v4.28.0 配置文档](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/docs/zh/dev/star/guides/plugin-config.md)
- [AstrBot v4.28.0 配置字段组件](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/dashboard/src/components/shared/ConfigItemRenderer.vue)
- [AstrBot v4.28.0 安装列表](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/dashboard/src/views/extension/InstalledPluginsTab.vue)
- [AstrBot v4.28.0 插件详情](https://github.com/AstrBotDevs/AstrBot/blob/a412146401426c0cdff8bbefb8627a03da519da8/dashboard/src/views/extension/PluginDetailPage.vue)
- [AstrBot 社区发布文档](https://docs.astrbot.app/dev/star/plugin-publish.html)，另核对本机分析仓库 `c6b2c65b0` 的同名源码
- [Koishi 配置、依赖与服务展示](https://github.com/koishijs/webui/blob/1dc5c0e1c76a207c2ec48697d4b56364cfe28dce/plugins/config/client/components/plugin.vue)
- [Koishi 多份插件配置](https://github.com/koishijs/webui/blob/1dc5c0e1c76a207c2ec48697d4b56364cfe28dce/plugins/config/client/components/forks.vue)
- [Koishi 市场安装器](https://github.com/koishijs/webui/blob/1dc5c0e1c76a207c2ec48697d4b56364cfe28dce/plugins/market/src/node/installer.ts)
- [Koishi schema 服务](https://github.com/koishijs/koishi/blob/97d5c395750cec37b772e0b94dc63c427e3bb868/packages/core/src/schema.ts)
- 本机实际插件：`astrbot_plugin_gsvi_short_tts`、`astrbot_plugin_batchrecall`、`astrbot_plugin_image_generation`、`astrbot_plugin_context_enishi` 的 `_conf_schema.json`。
