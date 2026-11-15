# 插件操作接入：第四阶段 B

插件资源编辑、操作入口、Pi 工具、QQ/Mock 指令和后台 Job 已接入应用代码。插件执行后端默认关闭；本阶段使用自主编写的 Worker 子进程、假模型和假 MCP 完成流程验证，没有启用真实插件容器。部署与验收记录见 [阶段交付记录](implementation.md)。

## 配置与使用

「能力资源 → 插件实例」支持登记、编辑、删除和导入固定快照。保存配置与导入代码分开，导入仍不运行入口、依赖安装或构建脚本。

页面显示停用、尚未导入、已导入但运行时关闭、已配置待调用四种状态，并列出操作、指令、schema 和切入点定义。插件设置的每个顶层值均用占位保留，修改时填写新值，删除键表示移除设置。这样不需要依赖插件对敏感字段命名的约定。连接器只配置别名与服务 ID；上游凭据由 Bot 持有。

写入检查配置与包目录版本，过期页面和过期导入不能覆盖新快照。命令别名冲突、排序环路和必需依赖缺失会阻止应用新配置，旧配置继续使用。被群设置、权限、常驻集合或其他插件依赖引用的实例不能直接删除，可先停用或解除引用。编辑 MCP、Skill 和插件会保留其余资源。

「Bot 设置」增加插件实例选择、参数覆盖、处理器优先级与停用项，沿用默认 → 账号 → 群 → 对话的继承顺序。参数覆盖进入对应 Worker 的本次调用快照；人格和触发权限仍由框架分别处理。核心消息/交付处理器现由 [第四阶段 C](plugin-pipeline.md) 接入实际流水线。

## 一套操作，两种入口

manifest 中的 operation 定义参数、超时、宿主服务授权及同步/后台执行方式。Pi 工具和指令都引用这个 operation：

```json
{
  "apiVersion": 1,
  "id": "echo",
  "name": "回声",
  "version": "1.0.0",
  "description": "最小操作示例",
  "entry": "main.mjs",
  "files": ["main.mjs"],
  "operations": [{
    "id": "echo",
    "title": "回声",
    "description": "返回输入内容",
    "inputSchema": {
      "type": "object",
      "properties": { "text": { "type": "string" } },
      "required": ["text"]
    },
    "tool": true,
    "execution": "foreground",
    "timeoutMs": 30000
  }],
  "commands": [{
    "id": "echo",
    "names": ["echo"],
    "operation": "echo",
    "description": "返回输入内容",
    "arguments": "text",
    "textField": "text"
  }]
}
```

`main.mjs`：

```js
export default {
  operations: {
    echo(input, context) {
      return { text: input.text }
    }
  }
}
```

实际实例 ID 可以与包 ID 不同，稳定能力为 `plugin:<实例>/<操作>`，指令能力为 `command:plugin:<实例>/<指令>`。模型别名不承担授权职责。工具继续经过现有 Pi 按需搜索/收纳机制。

已登记的 QQ 指令可直接发送，不要求 `!pi` 或 @；Mock 使用同一入口。`/help` 列出当前来源有权使用的插件指令。指令支持文本、JSON、无参数和隔离 Worker 中的自定义解析器；解析器没有宿主服务授权。关闭群 Agent 仍可使用获准的指令，不会额外调用模型。

指令同时检查 command 与 operation 权限，不能绕过工具规则。实例、范围选择、触发身份上限和当前权限均生效；`plugin:<实例>/*` 可作为权限规则。排队结束、实际执行前重新检查授权。停用实例会中断其活动调用并回收 Worker；群 `/stop` 覆盖插件指令。结果与分部交付再次检查取消和权限，避免迟到输出。

## 可调用的宿主服务

插件使用 `context.host(method, params)`，同时满足 operation 的 `grants`、实例的 `grants` 和本次调用授权。群号、成员身份、版本和截止时间由核心绑定，参数不能替换这些信息。

| 方法 | 授权 | 行为 |
| --- | --- | --- |
| `history.read` | `history.read`，以及触发人的 `chat_history` | 读取本群经既有规则投影的历史 |
| `artifact.read` | `artifact.read`，以及触发人的 `artifact_read` | 分段读取本群产物，返回 Base64，不返回宿主路径 |
| `artifact.write` | `artifact.write` | 将提供的文本或 Base64 登记为本群产物 |
| `delivery.send` | `delivery.send`，以及触发人的 `chat_send` | 发送有意的额外通知，进入现有交付账本 |
| `connector:<别名>` | `connector:<别名>`，以及对应 MCP 工具权限 | 调用该别名绑定的 MCP 工具 |

产物写入每个 RPC 最多 300000 个数据字符，每次插件调用最多 12 项、8 MiB；大段操作结果保存为文本产物，模型仅获得摘要和 ID。当前没有从插件容器直接发布大文件的 API。MCP 连接器可直接转交框架归档的图片/音频等产物 ID。

MCP 连接器例子：实例配置 `connectors: { "reports": "report-service" }`，插件声明并获准 `connector:reports` 后调用：

```js
const result = await context.host('connector:reports', {
  tool: 'generate_report',
  arguments: { query: input.query }
})
```

插件收到公开文字、产物 ID 和错误标志，不收到服务 URL 中的凭据、Headers、HTTP 会话或 MCP 私有 `_meta`。当前连接器 RPC 用于普通 MCP 调用；要求 MCP Tasks 的工具继续使用框架已有的原生 Job 入口。插件自己的 HTTP 连接器、跨插件 operation RPC 和私有存储 RPC 还未开放，不能因为 manifest 中声明了 grant 就认为服务已经存在。

## 异步操作

`execution: "background"` 的模型工具和指令立即创建框架 Job。Job 调用 operation 一次；若返回等待句柄，后续调用声明的 `poll`，取消时调用声明的 `cancel`。这些辅助函数放在 Worker 的 `operations` 中，无需作为额外 LLM 工具发布。

| 返回值 | 含义 |
| --- | --- |
| `{ text, artifactIds?, value? }` | 同步完成的简写 |
| `{ status: "done", result: { text, artifactIds?, value? } }` | 操作完成 |
| `{ status: "pending", handle, pollAfterMs }` | 已受理，稍后用私有 handle 查询 |
| `{ status: "failed", error }` | 操作本身已确认失败 |
| `{ status: "cancelled", message? }` | 已确认取消 |

`poll` / `cancel` 接收 `{ handle }`。句柄可以是 JSON，但不进入公共任务列表和群上下文。返回 `pending` 必须声明 `poll`，间隔至少 250 ms。取消请求失败应抛出错误或返回仍在进行的状态，不能把“取消接口失败”谎报为“远端操作已经失败”。

框架在提交前持久化检查点，在保存回执后才进入轮询。重启继续固定代码和原句柄；尚未取得回执的提交成为 `outcome_unknown`，不会重跑。查询失败有限退避，默认每实例最多 8 项自动等待中的任务、3 次连续查询失败；休眠期间释放 Worker。插件负责实现远端协议，并保证 poll 不重新提交工作及句柄的可恢复性。未知结果目前退出自动等待名额，不能据此认为远端资源已经释放；远端业务并发仍需服务端额度保护。

终态结果经现有 Job/Artifact/Delivery 交付，向主对话返回精简事实，不增加总结模型调用。后台插件不能直接发送群消息。结果未知可在任务页显式查询或重试取消；查询仅使用已有句柄，不重建工作或重发聊天结果。没有句柄的任务无法自动核对。

固定快照与实时撤权分别处理：更新来源或连接配置不取消已经有回执的工作；停用实例/连接器、移出群选择、撤销权限或切换对话会阻止旧工作继续操作或交付。核对仍遵循原任务上限和当前权限，并不绕过已失效的聊天上下文。

## 当前边界

共享核心切入点、呈现选择、持久观察与跨插件 operation RPC 已由第四阶段 C 接入。第四阶段 D 随后完成硬容量持久卷、大文件发布、自定义切入点和真实临时容器验收；本页前述自主替身验证是更早的阶段记录。领域插件迁移继续推进，当前执行状态由在线诊断反映。Agent 的 Shipyard 文件与 Shell 边界不受这些插件配置影响。

测试覆盖真实 Bun Worker、Fake Responses/MCP、QQ 适配器收发、权限、取消、句柄保密、源码更新与重启、不明提交、未知取消核对和交付抑制；没有添加数据库测试或调用付费模型。共享浏览器验证插件配置、快照导入、设置保留、群级覆盖与恢复继承，桌面及 390 px 手机页面均通过。
