import { node, button, pill, pluginIcon as icon } from './dom'
import { plugins, type ExamplePlugin } from './fixtures'
import { instances, persist } from './state'

export function showInstall(
  plugin: ExamplePlugin,
  open: (plugin: ExamplePlugin) => void,
  notify: (message: string) => void
) {
  const dialog = node('dialog', 'install-dialog')
  const heading = node('div', 'detail-title')
  heading.append(icon(plugin), node('div', '', plugin.name))
  dialog.append(heading, node('p', 'muted', plugin.description), pill('版本 ' + plugin.version, 'neutral'))
  const explanation = node('section', 'install-summary')
  explanation.append(node('h3', '', '安装后会获得'))
  for (const feature of plugin.features) {
    explanation.append(node('p', '', feature.title + ' · ' + feature.kind))
  }
  explanation.append(node('h3', '', '需要连接的资源'))
  for (const need of plugin.needs) {
    explanation.append(node('p', '', need.name), node('p', 'muted', need.reason))
  }
  if (plugin.needs.length === 0) {
    explanation.append(node('p', 'muted', '无外部服务依赖。'))
  }
  const actions = node('div', 'dialog-actions')
  actions.append(
    button(
      '取消',
      () => {
        dialog.close()
      },
      'button secondary'
    ),
    button(
      '添加示例并配置',
      () => {
        instances[plugin.id].installed = true
        persist()
        dialog.close()
        open(plugin)
        notify('已添加到浏览器样例。没有下载或执行插件。')
      },
      'button primary'
    )
  )
  dialog.append(
    explanation,
    node('p', 'muted', '正式版本在这里显示发布来源、固定版本和安装进度。本页仅演示交互。'),
    actions
  )
  document.body.append(dialog)
  dialog.addEventListener('close', () => {
    dialog.remove()
  })
  dialog.showModal()
}
export function showSourceDialog(open: (plugin: ExamplePlugin) => void, notify: (message: string) => void) {
  const dialog = node('dialog', 'install-dialog')
  dialog.append(node('h2', '', '从链接安装'))
  const label = node('label', 'stacked-label', '插件发布链接或 npm 包名')
  const input = node('input')
  input.placeholder = 'GitHub Release 链接 / npm 包名'
  input.setAttribute('aria-label', '插件发布链接或 npm 包名')
  label.append(input)
  dialog.append(
    label,
    node('p', 'muted', '正式版本先解析发布描述，再展示版本、配置与所需能力。用户无需填写宿主目录。'),
    node('p', 'notice', '这里是设计预览，不会下载或执行提交的内容。')
  )
  const actions = node('div', 'dialog-actions')
  actions.append(
    button(
      '返回',
      () => {
        dialog.close()
      },
      'button secondary'
    ),
    button(
      '查看安装流程样例',
      () => {
        dialog.close()
        showInstall(plugins[2], open, notify)
      },
      'button primary'
    )
  )
  dialog.append(actions)
  document.body.append(dialog)
  dialog.addEventListener('close', () => {
    dialog.remove()
  })
  dialog.showModal()
}
