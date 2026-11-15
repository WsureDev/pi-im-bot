import { node, button, pill, pluginIcon as icon } from './dom'
import { capabilities, pipeline } from './detail-panels'
import { showInstall, showSourceDialog } from './installation'
import { plugins, type ExamplePlugin } from './fixtures'
import { configForm } from './fields'
import { instances, persist, blocked, rooms } from './state'
import { defaults, type Settings } from './schema'

const app = document.querySelector<HTMLDivElement>('#app')!
const sidebar = node('aside', 'sidebar')
sidebar.append(node('div', 'brand', 'π  ·  IM BOT'), node('p', 'nav-heading', '工作空间'))
for (const [icon, label] of [
  ['◫', '聊天调试'],
  ['◎', '模型与 Provider'],
  ['◇', '插件中心'],
  ['⌘', 'MCP 与 Skill'],
  ['◷', '任务与计划']
]) {
  const item = node('div', 'nav-item')
  item.title = label
  item.append(node('span', 'nav-icon', icon), node('span', 'nav-label', label))
  if (label === '插件中心') {
    item.classList.add('active')
  }
  sidebar.append(item)
}
sidebar.append(node('div', 'sidebar-footer', '设计预览 / NOV 2026'))
const main = node('main', 'main')
const preview = node('div', 'preview-banner', '交互设计样例 · 插件与服务均为示例，操作只保存在此浏览器')
const content = node('div', 'page')
const toast = node('div', 'toast')
toast.setAttribute('role', 'status')
main.append(preview, content)
app.append(sidebar, main, toast)
let mode = 'installed'
let search = ''
let category = '全部分类'
let selected: ExamplePlugin | undefined
let tab = '配置'
let scope = 'instance'
let draft: Settings = {}
let overrides: Record<string, Settings> = {}

function notify(text: string) {
  toast.textContent = text
  toast.classList.add('visible')
  setTimeout(() => {
    toast.classList.remove('visible')
  }, 3500)
}
function status(plugin: ExamplePlugin) {
  const instance = instances[plugin.id]
  if (!instance.installed) {
    return pill('配置样例', 'neutral')
  }
  const issue = blocked(plugin.id)
  if (issue) {
    return pill(issue, 'amber')
  }
  if (instance.enabled) {
    return pill('已启用 · 示例', 'green')
  }
  return pill('已停用', 'neutral')
}
function open(plugin: ExamplePlugin) {
  selected = plugin
  tab = '配置'
  scope = 'instance'
  draft = structuredClone(instances[plugin.id].settings)
  overrides = structuredClone(instances[plugin.id].overrides)
  detail()
  window.scrollTo(0, 0)
}
function toggle(plugin: ExamplePlugin) {
  const instance = instances[plugin.id]
  if (blocked(plugin.id)) {
    notify('先在配置页绑定语音合成服务。')
    open(plugin)
    return
  }
  instance.enabled = !instance.enabled
  persist()
  if (selected) {
    detail()
  } else {
    listing()
  }
  notify('示例状态已更新。')
}
function install(plugin: ExamplePlugin) {
  showInstall(plugin, open, notify)
}
function sourceDialog() {
  showSourceDialog(open, notify)
}

function listing() {
  selected = undefined
  content.replaceChildren()
  window.scrollTo(0, 0)
  const header = node('header', 'page-header')
  const text = node('div')
  text.append(
    node('p', 'eyebrow', 'EXTENSIONS'),
    node('h1', '', '插件中心'),
    node('p', 'subtitle', '发现能力，配置行为，决定它在哪里生效。')
  )
  header.append(text, button('＋ 从链接安装', sourceDialog, 'button secondary'))
  const tabs = node('nav', 'tabs')
  tabs.setAttribute('aria-label', '插件中心视图')
  for (const [value, title] of [
    ['installed', '已安装'],
    ['discover', '发现插件'],
    ['diagnostics', '运行诊断']
  ]) {
    const item = button(
      title,
      () => {
        mode = value
        listing()
      },
      'tab'
    )
    if (mode === value) {
      item.classList.add('active')
    }
    tabs.append(item)
  }
  content.append(header, tabs)
  if (mode === 'diagnostics') {
    const panel = node('section', 'surface')
    panel.append(
      node('h2', '', '运行状态与资源'),
      node('p', 'muted', '诊断信息集中放在这里，配置插件时不需要理解 Worker、RPC 或磁盘卷。')
    )
    for (const [title, description] of [
      ['执行环境', '正式界面显示执行后端、依赖检查和恢复建议。此预览未连接正式 Bot。'],
      ['持久数据与产物', '按插件查看占用和额度；卸载插件与删除数据分开操作。'],
      ['任务与错误', '从失败记录跳到对应插件、任务和切入点，保留重试与未知状态的区别。']
    ]) {
      const row = node('div', 'diagnostic-row')
      row.append(node('h3', '', title), node('p', 'muted', description))
      panel.append(row)
    }
    content.append(panel)
    return
  }
  const toolbar = node('div', 'toolbar')
  const query = node('input', 'search')
  query.placeholder = '搜索名称、功能或指令'
  query.setAttribute('aria-label', '搜索插件')
  query.value = search
  const filter = node('select')
  filter.setAttribute('aria-label', '插件分类')
  for (const name of [
    '全部分类',
    ...new Set(
      plugins.map((plugin) => {
        return plugin.category
      })
    )
  ]) {
    const option = node('option', '', name)
    filter.append(option)
  }
  filter.value = category
  const list = node('div', 'installed-list')
  if (mode === 'discover') {
    list.className = 'market-grid'
  }
  function renderList() {
    list.replaceChildren()
    const matching = plugins.filter((plugin) => {
      return (
        (mode !== 'installed' || instances[plugin.id].installed) &&
        (category === '全部分类' || plugin.category === category) &&
        (
          plugin.name +
          plugin.description +
          plugin.features
            .map((feature) => {
              return feature.title
            })
            .join(' ')
        )
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    })
    for (const plugin of matching) {
      const card = node('article', 'plugin-card')
      const info = node('div', 'plugin-info')
      const title = button(
        plugin.name,
        () => {
          open(plugin)
        },
        'plugin-name'
      )
      const metadata = node('div', 'plugin-meta')
      metadata.append(
        node('span', '', plugin.category),
        node('span', '', 'v' + plugin.version),
        node('span', '', '设计样例')
      )
      info.append(title, node('p', 'description', plugin.description), metadata)
      const actions = node('div', 'plugin-actions')
      actions.append(status(plugin))
      if (instances[plugin.id].installed) {
        actions.append(
          button(
            '配置',
            () => {
              open(plugin)
            },
            'button secondary small'
          )
        )
        const power = button(
          '启停 ' + plugin.name,
          () => {
            toggle(plugin)
          },
          'power-button'
        )
        power.setAttribute('role', 'switch')
        power.setAttribute('aria-checked', String(instances[plugin.id].enabled))
        power.title = '启用或停用'
        power.textContent = '⏻'
        if (instances[plugin.id].enabled) {
          power.classList.add('on')
        }
        actions.append(power)
      } else {
        actions.append(
          button(
            '安装',
            () => {
              install(plugin)
            },
            'button primary small'
          )
        )
      }
      card.append(icon(plugin), info, actions)
      list.append(card)
    }
    if (matching.length === 0) {
      list.append(node('p', 'empty', '没有匹配的插件，试试其他关键词或分类。'))
    }
  }
  query.addEventListener('input', () => {
    search = query.value
    renderList()
  })
  filter.addEventListener('change', () => {
    category = filter.value
    renderList()
  })
  toolbar.append(query, filter)
  content.append(toolbar)
  if (mode === 'discover') {
    const intro = node('div', 'market-intro')
    intro.append(
      node('h2', '', '为你的 Bot 找到下一项能力'),
      node('p', '', '这些是配置与安装流程样例。正式市场将展示来源、版本兼容性和更新记录。')
    )
    content.append(intro)
  }
  content.append(list)
  renderList()
}

function detail() {
  const plugin = selected!
  const instance = instances[plugin.id]
  content.replaceChildren()
  content.append(button('← 插件中心', listing, 'back-link'))
  const header = node('header', 'detail-header')
  const title = node('div', 'detail-title')
  const name = node('div')
  name.append(node('h1', '', plugin.name), node('p', 'muted', plugin.description))
  title.append(icon(plugin), name)
  const actions = node('div', 'inline-controls')
  actions.append(status(plugin))
  if (instance.installed) {
    let label = '启用插件'
    if (instance.enabled) {
      label = '停用插件'
    }
    actions.append(
      button(
        label,
        () => {
          toggle(plugin)
        },
        'button secondary'
      )
    )
  } else {
    actions.append(
      button(
        '安装并配置',
        () => {
          install(plugin)
        },
        'button primary'
      )
    )
  }
  header.append(title, actions)
  const tabs = node('nav', 'tabs')
  for (const label of ['配置', '能力与范围', '执行顺序', '版本与数据']) {
    const item = button(
      label,
      () => {
        tab = label
        detail()
      },
      'tab'
    )
    if (tab === label) {
      item.classList.add('active')
    }
    tabs.append(item)
  }
  content.append(header, tabs)
  if (tab === '配置') {
    const context = node('div', 'scope-bar')
    const selector = node('select')
    selector.setAttribute('aria-label', '配置作用域')
    for (const [value, title] of [
      ['instance', '实例默认配置'],
      ...rooms.map((room) => {
        return [room.id, room.name + '（示例）']
      })
    ]) {
      const option = node('option', '', title)
      option.value = value
      selector.append(option)
    }
    selector.value = scope
    selector.addEventListener('change', () => {
      scope = selector.value
      detail()
    })
    context.append(
      node('span', '', '正在配置'),
      selector,
      node('span', 'muted', '群内所有成员共享；成员工具权限单独检查。')
    )
    const form = node('form', 'config-layout')
    const body = node('section', 'surface config-main')
    overrides[scope] ??= {}
    body.append(
      configForm(plugin.schema, { scope, base: draft, overrides: overrides[scope], changed: detail })
    )
    const aside = node('aside', 'config-aside')
    aside.append(
      node('div', 'eyebrow', 'CONFIGURATION'),
      node('h3', '', '声明一次，生成表单'),
      node('p', 'muted', '页面直接读取 _conf_schema.json。插件作者不需要编写配置页面。'),
      node('code', 'schema-file', '_conf_schema.json')
    )
    const definition = node('details', 'source-preview')
    definition.append(
      node('summary', '', '查看此插件的配置 schema'),
      node('pre', '', JSON.stringify(plugin.schema, null, 2))
    )
    aside.append(definition)
    const help = node('div', 'aside-note')
    help.append(
      node('h3', '', '配置与能力分开管理'),
      node('p', 'muted', '连接器、工具与切入点在「能力与范围」中说明；群级偏好在这里覆盖。')
    )
    aside.append(help)
    const footer = node('footer', 'save-bar')
    footer.append(node('span', 'muted', '保存只更新浏览器中的设计样例。'))
    const save = node('button', 'button primary', '保存配置')
    save.type = 'submit'
    footer.append(
      button(
        '恢复默认值',
        () => {
          draft = defaults(plugin.schema)
          overrides = {}
          detail()
        },
        'button secondary'
      ),
      save
    )
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      instance.settings = structuredClone(draft)
      instance.overrides = structuredClone(overrides)
      persist()
      detail()
      notify('配置已保存到浏览器样例。')
    })
    form.append(body, aside, footer)
    content.append(context, form)
  } else if (tab === '能力与范围') {
    content.append(capabilities(plugin, notify))
  } else if (tab === '执行顺序') {
    content.append(pipeline(plugin, notify))
  } else {
    const panel = node('section', 'surface')
    panel.append(
      node('h2', '', '发布与版本'),
      node('p', '', '版本 ' + plugin.version + ' · 来源：项目内设计样例'),
      node(
        'p',
        'muted',
        '正式安装会固定发布版本与内容摘要。更新先展示配置、能力和依赖变化，失败保留当前可用版本。'
      ),
      node('h2', '', '数据与卸载'),
      node('p', 'muted', '插件配置、私有持久数据和已发布产物分别管理。代码回滚不自动回滚业务数据。')
    )
    panel.append(
      button(
        '卸载示例，保留配置',
        () => {
          instance.installed = false
          instance.enabled = false
          persist()
          listing()
          notify('示例已卸载，配置保留。')
        },
        'button secondary danger'
      )
    )
    content.append(panel)
  }
}

listing()
