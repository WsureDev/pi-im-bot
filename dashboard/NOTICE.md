# 来源、许可与适配记录

固定上游：[AstrBot v4.28.0](https://github.com/AstrBotDevs/AstrBot/tree/a412146401426c0cdff8bbefb8627a03da519da8/dashboard)。完整逐文件来源和原始 SHA-256 见 `UPSTREAM.json`。

- AstrBot 业务界面及其派生修改保留 [AGPL-3.0](licenses/AstrBot-AGPL-3.0.txt)。本目录的 package.json 使用 `AGPL-3.0-only`。
- Dashboard 的 Berry/CodedThemes 模板保留上游 [MIT 声明](licenses/Berry-MIT.txt)。
- 固定上游的 MDI 字体子集保留 [Pictogrammers 声明](licenses/MDI.txt)。其余依赖保留各自包内许可。

| 上游部分                                                                                                | Pi 适配                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FullLayout、VerticalSidebar、VerticalHeader、LightTheme、DarkTheme                                      | 保留页面、渠道与连接状态的职责。布局、配色和响应式导航已重写。                                                                                   |
| AstrBotConfig、ConfigItemRenderer、ListConfigItem、ObjectEditor、TemplateListEditor、ConfigDefaultReset | 保留上游递归配置、列表/字典/模板编辑交互和样式；按 schema 而非返回值枚举字段，接入 Pi 继承、秘密 actions、稳定条目标识、只读约束及草稿确认。Monaco 改为按需本地加载。 |
| ChatMessageList、ChatInput、MarkdownMessagePart                                                         | 保留上游消息气泡、附件、输入区和 Markdown 展示；数据与事件改接 Pi 消息、媒体、引用、撤回和实时输出。工具事件由 UI SDK 时间线、耗时图与展开面板显示。                       |
| PluginWorkspacePage、ProviderPage、PlatformPage、ConfigPage、CronJobPage、ChatPage                      | 依据 Pi 的实际 API 裁剪及重接页面。模型/组、配置层级、OneBot 目标、计划与任务仍由 Pi 后端校验。                                                                       |
| UnsavedChangesConfirmDialog、ConfirmDialog、配置文案解析、中文文案、剪贴板工具                          | 复用成熟对话框、文案和 LAN HTTP 剪贴板回退，绑定 Pi 的页面事件。剪贴板工具的临时 textarea 只用于用户点击复制。                                                        |
| MDI 子集                                                                                                | 使用上游固定二进制和 CSS；应用图标选自该子集，避免下载完整字体。                                                                                                      |

工作台使用 @ui-sdk/vue 与 @ui-sdk/core（Apache-2.0）。Pi 在 src/ui 内实现主题、布局、配置控件和管理表格。数据转换位于 api/，页面状态位于 stores/。

2026-11-16 的设置页调整另外参考同一 commit 的 `components/config/AstrBotCoreConfigWrapper.vue`、`components/shared/PersonaForm.vue` 和相关 SCSS，采用分类导航、主要字段直接展示及明确的操作层次。根据 Pi 的使用反馈，导航改为定位展开的分组；配色与编辑器尺寸经过适配。参考文件及原始 SHA-256 另记于 `UPSTREAM.json` 的 `designReferences`。
