export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) {
  const element = document.createElement(tag)
  element.className = className
  if (text !== undefined) {
    element.textContent = text
  }
  return element
}

export function button(label: string, action: () => void, className = 'button') {
  const element = node('button', className, label)
  element.type = 'button'
  element.addEventListener('click', action)
  return element
}

export function pill(label: string, tone = '') {
  return node('span', 'pill ' + tone, label)
}

export function pluginIcon(plugin: { color: string; icon: string }) {
  return node('div', 'plugin-icon ' + plugin.color, plugin.icon)
}
