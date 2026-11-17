# 通用资源协议 v2

本版替代原先以语音/图像种类组织资源的设计。Bot 不定义资源的业务类型，也不定义必须实现哪些业务方法。GSVI、ComfyUI、业务 API、文件处理后端都是提供者插件的例子。

## 提供者声明与资源实例

`ProviderDeclaration` 包含 `apiVersion: 2`、ID、所属插件、发布版本、说明、连接配置 Schema、实例配置 Schema、展示列以及 `operations[]`。**没有 resourceKind 或 kindTitle，也没有 Bot 内置的业务操作枚举。**

每项操作由提供者定义 `id/version/title/description/inputSchema/outputSchema/inputUiSchema/example/timeoutMs/effect`。输入输出使用 JSON Schema 2020-12，根为对象，属性可以是嵌套对象、数组等 JSON 数据。使用 Ajv 校验契约与实际数据，不进行隐式类型转换，也不加载远程 schema 引用。[Ajv 官方 JSON Schema 文档](https://ajv.js.org/json-schema.html)。

UI Schema 复用现有 AstrBot 配置字段元数据，只决定表单控件、说明和默认值。它不能代替输入输出的 JSON Schema 校验。复杂输入可以切换为 JSON 编辑，避免把能力限制在现有表单控件范围内。

资源实例的发现描述包含 `externalId/name/description/attributes/operationIds`。资源可暴露提供者声明的多个操作，也可暴露其子集。主机分配稳定 ID、归属、启用状态、发现状态和本地配置。发现不能改写其他资源的配置。再发现保留配置；失踪项标记 stale；注销提供者后引用保留但调用拒绝。

常规配置读取只返回秘密字段的 configured 状态；编辑表单通过针对该对象且校验版本的私密 POST 读取原值，默认使用密码框掩码，眼睛图标切换显示。更新动作由表单自动生成，用户直接编辑或清空即可。状态原子写入，文件权限 0600。详见 [密钥输入](SECRET-INPUTS.md)。

## 统一调用

`POST /api/research/operations/invoke` 接收：

```json
{
  "resourceId": "provider-files.main.documents",
  "operationId": "normalize",
  "operationVersion": "1.0.0",
  "revision": 1,
  "parameters": { "text": "  Hello  \n\n World " }
}
```

服务端核对状态版本、资源/提供者可用性、资源是否暴露操作以及操作版本，然后校验参数。提供者收到操作 ID、外部实例 ID、参数、连接/实例配置快照、requestId 和取消信号。返回数据通过输出 Schema 校验后才交给调用者。所有业务适配都留在 Provider 模块；调用器没有按语音、图像、文件等分类的分支。

成功封装包含 requestId、resourceId、operationId、status、elapsedMs、output。本 Demo 还包含 demonstration:true。失败封装使用稳定错误码和可公开消息，不返回提供者的原始异常或不合规输出。超时不会自动重试；取消等待也不意味着外部副作用已回滚。真实有副作用的 API 应后续接入已有持久任务/幂等机制。

页面的“直接调用”是 LAN 管理工作台的操作测试入口，不经过 LLM。文本处理执行本地字符串运算；业务 API、GSVI 和 ComfyUI 返回模拟响应，均不访问真实上游，也不读取宿主文件。

## 与指令、MCP 的关系

资源是能力与调用的基础层。直接测试界面、MCP 出口、指令入口可以消费同一操作声明：

```text
普通 API / 文件后端 → 提供者适配器 → 资源实例 + 操作契约
                                      ├─ 管理界面直接调用
                                      ├─ MCP Tool 适配器（后续）
                                      └─ 指令参数映射与结果展示（后续）
```

当前预设的绑定改为 `capabilityId → {resourceId, operationId}`。可以引用任意提供者的已声明操作，无资源类型筛选。此引用用于现有权限演示与可用性检查，不代表任意操作可直接接收旧命令参数。真正转指令时需显式配置命令名、参数映射/默认值、结果展示和角色策略；输入校验不能绕过。现有 MCP Tool 将来可经对应适配器提供同样的引用和调用能力。

当前已实现操作列表、契约展示、表单/JSON 参数调试、统一调用、取消等待和操作引用；**尚未实现 MCP 服务发布、MCP Tool 导入、任意指令的实际参数映射/派发**。界面的 Tool 描述只是声明预览，不是已注册到 Agent 的工具。

## 身份与生产边界

群/私聊、Bot 管理/渠道管理/任何人的策略和图编排保持现有语义。上下文里的资源引用改为操作 ID。真正从指令或 MCP 调用时，应由主机携带原始触发人的可信上下文，并同时检查入口策略、插件授权及实例可用性；不能把管理工作台的调试入口暴露为插件权限通道。

本 Demo 的五个提供者模块都是作者编写的 fixture。生产的第三方提供者必须通过既有隔离 worker RPC 注册声明、发现和调用，owner/generation 由主机推导，不能直接导入 Core 或自报权限。Bot 不会因为某个 Provider 新增业务操作就增加资源枚举。

## 数据更新

预览状态版本升为 2。`preview/migrate-resources.ts` 是一次性迁移工具，根据旧资源记录与现有业务入口的默认引用转换绑定，并保留用户修改的策略、编排、秘密字段和资源配置。迁移前停预览并备份，成功后原子替换；不迁移或修改 19335 的生产数据。运行时不兼容旧的类型绑定 HTTP API。
