import { z } from 'zod'
import { node, button, pill } from './dom'
import { defaults, SettingsSchema, type ConfigField, type Settings } from './schema'

interface FormOptions {
  scope: string
  base: Settings
  overrides: Settings
  changed(): void
  prefix?: string
}
const specialOptions = {
  select_mcp: [
    ['image-gateway', '图像网关（示例 MCP）'],
    ['comfyui', 'ComfyUI（示例 MCP）']
  ],
  select_provider: [
    ['main', '主模型组（示例）'],
    ['backup', '备用模型组（示例）']
  ],
  select_persona: [
    ['default', '默认助手（示例）'],
    ['artist', '绘图助手（示例）']
  ]
}

export function configForm(fields: Record<string, ConfigField>, options: FormOptions) {
  const root = node('div', 'schema-form')
  const top = options.scope === 'instance'
  function render(
    container: HTMLElement,
    definition: Record<string, ConfigField>,
    base: Settings,
    overrides: Settings,
    prefix = ''
  ) {
    for (const [key, field] of Object.entries(definition)) {
      const effective = { ...base, ...overrides }
      if (
        field.condition &&
        Object.entries(field.condition).some(([name, expected]) => {
          return JSON.stringify(effective[name]) !== JSON.stringify(expected)
        })
      ) {
        continue
      }
      const path = prefix + key
      if (field.type === 'object') {
        const section = node('section', 'config-section')
        section.append(node('h3', '', field.description))
        if (field.hint) {
          section.append(node('p', 'section-hint', field.hint))
        }
        const inherited = SettingsSchema.parse(base[key] ?? defaults(field.items ?? {}))
        const local = SettingsSchema.parse(overrides[key] ?? {})
        if (top) {
          base[key] = inherited
        } else {
          overrides[key] = local
        }
        render(section, field.items ?? {}, inherited, local, path + '.')
        container.append(section)
        continue
      }
      const row = node('div', 'config-row')
      const info = node('div', 'field-info')
      const label = node('label', '', field.description)
      label.htmlFor = 'config-' + path
      info.append(label)
      if (field.hint) {
        info.append(node('p', 'muted', field.hint))
      }
      let inherited = false
      let editable = true
      if (!top) {
        if (!(field.scope ?? ['instance']).includes('room')) {
          editable = false
          info.append(pill('仅实例配置', 'neutral'))
        } else {
          inherited = !Object.hasOwn(overrides, key)
          const inherit = node('input')
          inherit.type = 'checkbox'
          inherit.checked = inherited
          inherit.setAttribute('aria-label', field.description + '：继承实例配置')
          const control = node('label', 'inherit-control')
          control.append(inherit, node('span', '', '继承实例配置'))
          info.append(control)
          inherit.addEventListener('change', () => {
            if (inherit.checked) {
              delete overrides[key]
            } else {
              overrides[key] = structuredClone(base[key])
            }
            options.changed()
          })
          editable = !inherited
        }
      }
      function write(value: z.infer<typeof SettingsSchema>[string]) {
        if (top) {
          base[key] = value
        } else {
          overrides[key] = value
        }
      }
      let value = base[key]
      if (!top && Object.hasOwn(overrides, key)) {
        value = overrides[key]
      }
      const inputArea = node('div', 'field-input')
      if (field.type === 'template_list') {
        const entries = z.array(SettingsSchema).parse(value ?? [])
        if (editable) {
          write(entries)
        }
        const template = node('select')
        template.setAttribute('aria-label', field.description + '模板')
        for (const [templateKey, item] of Object.entries(field.templates ?? {})) {
          const option = node('option', '', item.name)
          option.value = templateKey
          template.append(option)
        }
        const add = button(
          '添加预设',
          () => {
            const selected = field.templates?.[template.value]
            if (selected) {
              entries.push({ __template_key: template.value, ...defaults(selected.items) })
              write(entries)
              options.changed()
            }
          },
          'button secondary small'
        )
        add.disabled = !editable
        template.disabled = !editable
        const tools = node('div', 'inline-controls')
        tools.append(template, add)
        inputArea.append(tools)
        for (const [index, entry] of entries.entries()) {
          const templateKey = z.string().parse(entry.__template_key)
          const spec = field.templates?.[templateKey]
          if (!spec) {
            continue
          }
          const card = node('details', 'template-card')
          card.open = true
          card.append(node('summary', '', z.string().parse(entry[spec.display_item ?? 'name'] ?? spec.name)))
          const body = node('div', 'template-body')
          const editor = configForm(spec.items, {
            scope: 'instance',
            base: entry,
            overrides: {},
            changed: options.changed,
            prefix: path + '.' + index + '.'
          })
          const group = node('fieldset')
          group.disabled = !editable
          group.append(editor)
          const remove = button(
            '删除此预设',
            () => {
              entries.splice(index, 1)
              write(entries)
              options.changed()
            },
            'text-button danger'
          )
          remove.disabled = !editable
          body.append(group, remove)
          card.append(body)
          inputArea.append(card)
        }
      } else if (field.type === 'bool') {
        const input = node('input', 'toggle-input')
        input.type = 'checkbox'
        input.id = 'config-' + path
        input.checked = z.boolean().parse(value)
        input.disabled = !editable
        input.setAttribute('aria-label', field.description)
        input.addEventListener('change', () => {
          write(input.checked)
          options.changed()
        })
        inputArea.append(input)
      } else if (field.options || field._special) {
        const input = node('select')
        const choices = (field.options ?? []).map((value, index) => {
          return [String(value), field.labels?.[index] ?? String(value)]
        })
        if (field._special) {
          choices.push(...specialOptions[field._special])
        }
        for (const [value, label] of choices) {
          const option = node('option', '', label)
          option.value = value
          input.append(option)
        }
        input.id = 'config-' + path
        input.value = String(z.union([z.string(), z.number()]).parse(value))
        input.disabled = !editable
        input.addEventListener('change', () => {
          const selected = field.options?.find((option) => {
            return String(option) === input.value
          })
          write(selected ?? input.value)
        })
        inputArea.append(input)
      } else {
        let input: HTMLInputElement | HTMLTextAreaElement
        if (field.type === 'text' || field.type === 'list') {
          input = node('textarea')
          input.rows = 3
        } else {
          input = node('input')
          input.type = 'text'
          if (field.secret) {
            input.type = 'password'
          } else if (field.type === 'int' || field.type === 'float') {
            input.type = 'number'
            input.min = '0'
            input.step = '1'
            if (field.type === 'float') {
              input.step = 'any'
            }
            if (field.slider) {
              input.min = String(field.slider.min)
              input.max = String(field.slider.max)
              input.step = String(field.slider.step)
            }
          }
        }
        input.id = 'config-' + path
        input.value = String(value ?? '')
        if (field.type === 'list') {
          input.value = z
            .array(z.string())
            .parse(value ?? [])
            .join('\n')
        }
        input.disabled = !editable
        input.addEventListener('change', () => {
          if (field.type === 'int' || field.type === 'float') {
            write(z.coerce.number().finite().parse(input.value))
          } else if (field.type === 'list') {
            write(input.value.split('\n').filter(Boolean))
          } else {
            write(input.value)
          }
        })
        inputArea.append(input)
        if (field.slider) {
          const range = node('input')
          range.type = 'range'
          range.min = String(field.slider.min)
          range.max = String(field.slider.max)
          range.step = String(field.slider.step)
          range.value = input.value
          range.disabled = !editable
          range.setAttribute('aria-label', field.description + '滑块')
          range.addEventListener('input', () => {
            input.value = range.value
            write(Number(range.value))
          })
          inputArea.append(range)
        }
      }
      row.append(info, inputArea)
      container.append(row)
    }
  }
  render(root, fields, options.base, options.overrides, options.prefix)
  return root
}
