import { node, pill } from './dom'
import type { ExamplePlugin } from './fixtures'
import { instances, persist, rooms } from './state'

export function capabilities(plugin: ExamplePlugin, notify: (message: string) => void) {
  const root = node('div', 'two-columns')
  const features = node('section', 'surface')
  features.append(node('h2', '', '提供哪些能力'))
  for (const feature of plugin.features) {
    const item = node('div', 'feature')
    item.append(
      pill(feature.kind, 'neutral'),
      node('h3', '', feature.title),
      node('p', 'muted', feature.description)
    )
    if (feature.writes) {
      item.append(node('p', 'boundary', '可影响：' + feature.writes))
    }
    features.append(item)
  }
  features.append(node('h2', '', '需要使用什么'))
  for (const permission of plugin.permissions) {
    features.append(node('h3', '', permission.title), node('p', 'muted', permission.detail))
  }
  for (const need of plugin.needs) {
    features.append(node('h3', '', need.name), node('p', 'muted', need.reason))
  }
  const scopes = node('section', 'surface')
  scopes.append(
    node('h2', '', '在哪里启用'),
    node('p', 'muted', '选定聊天范围，再由框架检查本轮触发人的权限。')
  )
  for (const room of rooms) {
    const label = node('label', 'room-option')
    const checkbox = node('input')
    checkbox.type = 'checkbox'
    checkbox.checked = instances[plugin.id].rooms.includes(room.id)
    checkbox.addEventListener('change', () => {
      const current = instances[plugin.id]
      current.rooms = current.rooms.filter((value) => {
        return value !== room.id
      })
      if (checkbox.checked) {
        current.rooms.push(room.id)
      }
      persist()
      notify('示例生效范围已更新。')
    })
    const text = node('span')
    text.append(node('strong', '', room.name), node('small', 'muted', room.hint))
    label.append(checkbox, text)
    scopes.append(label)
  }
  scopes.append(
    node(
      'div',
      'aside-note',
      '服务绑定与能力授权由可选列表生成，用户无需填写 grant 或映射 JSON。正式能力检查仍由核心执行。'
    )
  )
  root.append(features, scopes)
  return root
}

export function pipeline(plugin: ExamplePlugin, notify: (message: string) => void) {
  const panel = node('section', 'surface')
  panel.append(
    node('h2', '', '它在回复流程的哪个位置'),
    node('p', 'muted', '只调整同一切入点里的处理顺序。阶段和必需依赖由框架保证。')
  )
  for (const [index, title] of ['文字整理', '回复呈现', '平台发送', '回执观察'].entries()) {
    const step = node('div', 'pipeline-step')
    step.append(node('span', 'step-number', String(index + 1)), node('strong', '', title))
    if ((plugin.id === 'voice' && index === 1) || (plugin.id === 'recall' && index === 3)) {
      step.classList.add('highlight')
      step.append(pill(plugin.name, 'green'))
      const select = node('select')
      select.setAttribute('aria-label', plugin.name + '优先级')
      for (const [value, name] of [
        ['50', '优先执行'],
        ['0', '默认顺序'],
        ['-50', '稍后执行']
      ]) {
        const option = node('option', '', name)
        option.value = value
        select.append(option)
      }
      select.value = String(instances[plugin.id].priority)
      select.addEventListener('change', () => {
        instances[plugin.id].priority = Number(select.value)
        persist()
        notify('示例优先级已保存。')
      })
      step.append(select)
    } else {
      step.append(node('span', 'muted', '框架阶段'))
    }
    panel.append(step)
  }
  if (plugin.id === 'image-studio') {
    panel.append(
      node('p', 'notice', '图像工具由 Agent 或指令调用，后台完成后才进入交付流程，不接管每次回复。')
    )
  }
  return panel
}
