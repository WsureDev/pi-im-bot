# 插件中心：配置、获取与分发

本页的验收开关和依赖状态描述对应历史阶段；当前部署状态以在线诊断为准。2026-11-12 部署记录已启用，2026-11-13 只读观察确认 enabled:true；本轮源码修复未部署。详见 [审核修复记录](review-remediation-2026-11-12.md)。

第四阶段 E，2026-11-09 开始实施，2026-11-10 完成验收。首批产品功能已接入正式代码；隔离执行、Pi、Job 和发送账本继续使用已有实现。

## 管理入口

主导航提供「插件中心」，包含已安装、发现插件和编排；全局运行环境独立管理。实例详情只显示配置、使用方法；声明了 Hook 的插件额外显示编排。MCP 与 Skill 独立管理。产品收敛与真实能力核查见 [插件管理与能力对照](plugin-product-and-capabilities.md)。

- 已安装页显示真实实例、版本、配置/依赖状态、配置入口和启停。
- 配置页读取插件静态 `_conf_schema.json`，不为生成界面 import 插件 JS。
- 运行环境显示 Docker/镜像、FUSE 与文件系统工具的实际检查结果，可在 Web 检测、启用与停用，不要求手工修改配置后重启。
- schema 与无 setting 的声明服务绑定在同一配置表单保存；所需宿主能力从 manifest 取得，启用时带入，缺失时提供明确操作。
- 使用方法显示指令、工具与 README；强制更新和删除是直接管理动作。
- 编排由代码中的真实节点与契约生成，可设置处理器启停、优先级，保留拓扑约束；不混入账号、群和 conversation 的业务覆盖。

没有 schema 的插件明确显示没有可视化配置，不再在常规页面提供整份 settings/grants/依赖 JSON 文本框。Bot 设置里的插件 JSON 控件已移到专门的插件管理入口。

## 获取与安装

可以通过以下方式获取插件：

1. 「发现插件」中的项目内样例或已配置的静态社区目录。
2. GitHub 仓库/发布包链接。仓库有可用 Release ZIP 时优先使用；没有 Release 时解析默认分支，没有发布附件时使用 Release 标签源码。源码引用先解析为 commit，再下载固定 commit 的 ZIP。也可直接提供 HTTP(S) ZIP URL。
3. 上传 ZIP，压缩包最多 32 MiB。
4. 开发者选项中的本机已构建目录。

安装以独立管理任务显示进度，可以取消下载/校验；不占群主对话、不调用模型、不执行安装或构建脚本。进入应用阶段后不再接受取消，以免把已提交的版本误报为取消。

ZIP 只接受普通文件、目录及 store/deflate 压缩；检查路径、链接属性、数量、单文件/总大小、CRC 和目录一致性，拒绝分卷、加密及 ZIP64。展开后最多 64 MiB，单文件最多 16 MiB，最多 2004 个条目。支持单一顶层目录包。解压采用有输出上限的系统 zlib，不能靠伪造声明大小无限展开。

首次安装自动生成实例并保持停用。相同包再次安装更新既有实例，保留设置和数据。若更新使已启用实例的配置或依赖无效，会拒绝应用并保留当前版本；可先停用实例，再更新并完成新配置。新增授权不会自动加到已有实例。

### GitHub 链接

在「安装插件 → GitHub 仓库或发布包链接」直接粘贴：

```text
https://github.com/owner/plugin
https://github.com/owner/plugin.git
https://github.com/owner/plugin/tree/main
https://github.com/owner/plugin/tree/feature/voice/plugins/tts
https://github.com/owner/plugin/commit/完整或短commit
https://github.com/owner/plugin/releases/tag/v1.0.0
https://github.com/owner/plugin/releases/download/v1.0.0/plugin.zip
```

支持 `owner/plugin` 简写、`github.com/owner/plugin` 和复制的 GitHub SSH 形式，后者转为公开仓库 HTTPS 下载，不读取主机 SSH 密钥。还支持 archive ZIP 和指向 `plugin.json` 的 blob 链接。带斜杠的分支/标签会按 GitHub 实际引用解析，目录链接只导入选中的插件目录。

源码仓库的选定目录需有本框架的 `plugin.json`。入口支持 JS/MJS/CJS、TS/MTS/CTS；TypeScript 在隔离 Worker 内由 Bun 加载，安装时不执行入口。`files` 必须包含需要的代码与依赖，不能依赖消费者在宿主执行 npm install/build。仓库声明了未提交的 dist 入口时，需提交可运行入口或提供已构建 Release ZIP。

当前覆盖公开 GitHub 仓库。私有仓库认证、Git submodule 拉取和依赖自动安装尚未接入。仓库 ZIP 同样受现有下载/解包预算限制。GitHub 限流或访问拒绝会报告错误，不会改为下载别的分支。

安装记录保留仓库、引用、选中目录和固定 commit；内容按摘要保存为不可变快照。

先保存不可变包与版本目录，再原子更新 `resources.json` 中的 release 指针和配置。旧版本描述保留，失败/中断不会依靠重新执行插件来修复。管理任务重启后标明中断，不自动重新下载或提交。

卸载保留固定代码、私有数据、产物及原配置归档。仍被范围、权限规则或其他实例引用时会拒绝卸载并指出引用来源，需先解除相应引用；本期不自动批量改写所有聊天设置。

## AstrBot 风格配置

包内放置 `_conf_schema.json`，结构示例：

```json
{
  "reply": {
    "type": "object",
    "description": "回复样式",
    "items": {
      "prefix": {
        "type": "string",
        "description": "文字前缀",
        "default": "收到：",
        "scope": ["instance", "account", "room", "conversation"]
      }
    }
  }
}
```

当前支持 string、text、int、float、bool、object、字符串 list、标量 dict、template_list，以及 description/hint、默认值、options/labels、slider、条件显示、隐藏、只读、secret 和资源选择。`_special` 支持 MCP、已配置 Provider 模型、模型组和人格；选择模型不代表已经提供通用模型调用或语音连接器。

`scope` 默认为仅实例。嵌套 object 的子字段可分别声明账号、群、conversation 覆盖；数组和字典整体覆盖。恢复继承删除本层值，空字符串、false、空数组与空字典保持为显式覆盖。群员共用该群配置，不新增个人状态。

所有 HTTP 保存都由后端校验类型、选项、数值范围/步长、资源引用和覆盖层级。包 schema 有体积、深度和节点预算，不能声明任意 JS 校验器或不受限正则。原有 manifest 的工具/操作 JSON Schema 仍由隔离 Worker 校验，与业务配置 schema 分开。

秘密字段 GET 只返回已配置状态，保存通过替换/清除动作，未修改时保留原值。模板项有框架生成的稳定 UUID，重排不会把秘密值接到别的条目。字符串秘密列表作为一个字段整体保留/替换/清除，不提供按隐藏值下标拼接的操作。包含秘密值的复合列表本期仅在实例层编辑；凭据不写入群设置。

凭据保存在私有配置文件，未增加磁盘加密。Web 草稿只保存在当前页面内存，不放入 localStorage。发布包下载只包含固定代码/schema/文档，不包含实例配置、密钥或数据。

配置保存固定资源 revision、release、schema 与作用域版本；旧页面收到冲突，草稿不被自动覆盖。切换配置范围等待加载完成后才开放编辑。局域网 HTTP 页面使用 `getRandomValues` 生成条目标识，不依赖仅在安全上下文中可用的 `randomUUID`。

## 声明服务依赖

manifest 可以为实际使用的宿主服务声明可读名称：

```json
{
  "connections": [
    {
      "alias": "images",
      "kind": "mcp",
      "title": "图像 MCP 服务",
      "description": "提供本插件调用的图像工具",
      "required": true,
      "setting": "backend"
    }
  ]
}
```

`backend` 可声明 `_special: "select_mcp"`，框架从配置引用生成连接器映射。没有 setting 的连接器直接在插件配置表单选择。operation/handler 中的 `connector:` 和 `operation:` 声明也会生成可选绑定项；只有作者显式声明为必需的依赖才阻止实例启用。`required: false` 的依赖不会阻挡其他能力。

grant 仍受操作声明、实例允许、范围选择、触发人上限及调用时检查共同约束。界面不是新的授权来源，也不会把插件要求等同于成员获准。

## 发布插件与静态目录

项目内提供两个可执行样例：

- [回声指令](../../examples/plugins/echo/README.md)：工具与指令共用 operation，支持按群前缀。
- [延时撤回](../../examples/plugins/recall/README.md)：回执观察 + 持久撤回动作。

打包不执行入口，自动收集 manifest 声明的文件和可选 `_conf_schema.json`、README、CHANGELOG：

```sh
bun run pack:plugin examples/plugins/echo /tmp/echo.zip
```

不指定输出路径时，产物保存在任务专属 `/tmp/pi-plugin-pack-*/`。作者负责提供代码和依赖；TS 入口可由 Worker 中的 Bun 直接加载，需要额外构建的项目应提前构建。消费者不在 Bot 宿主执行第三方构建脚本。manifest 支持 author、license、repository、categories、platforms 等元数据，当前 API 兼容标识为 `apiVersion: 1`。

目录源通过插件中心网页配置，保存到 `resources.json.pluginCatalogs`。索引格式：

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "echo",
      "name": "回声指令",
      "version": "0.1.0",
      "description": "工具和指令示例",
      "author": "作者",
      "categories": ["开发工具"],
      "apiVersion": 1,
      "url": "https://example.invalid/releases/echo.zip",
      "sha256": "发布包的 64 位 SHA-256"
    }
  ]
}
```

索引只作元数据，校验摘要、包标识和版本后才能安装。刷新失败保留缓存；更换目录 URL 后不继续使用原 URL 的旧缓存。网页不回显目录地址的查询参数。

本地开发源使用相同协议：`http://localhost:19337/index.json`。源服务监听受维护工作区并发布 `-dev.N` 固定包，不在 GET 时构建、不自动安装。Bot 记录下载 ZIP 摘要，目录内已安装插件若有不同摘要，会提供「更新到此包」，包括语义版本未变的情况。

## 实现边界

尚未接入 npm tarball、配置型文件上传、完整的自定义前端页面、数据迁移协议、自动清理历史代码、第二份配置的快捷创建，以及通用 HTTP/语音服务连接器。早期 GSVI/图像工作室页面依然只是设计样例，不等同于已移植业务插件。

该阶段验收时插件执行后端关闭，彼时本机 fuse2fs 默认依赖未补齐；本轮没有为验收启动真实插件容器。正式启用与领域插件迁移另外推进。
