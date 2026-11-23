import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ResourceInstance } from '../../protocol'
import { ComfyServiceSchema } from '../../../services/comfy/resources'
import { ComfyResourceConfigurationSchema } from './contracts'

export function comfyResourceConnection(instance: ResourceInstance, maximumBytes = 32 * 1024 * 1024) {
  const config = ComfyResourceConfigurationSchema.parse(instance.configuration)
  let endpoint = config.server_address.trim().replace(/\/+$/u, '')
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(endpoint)) {
    endpoint = 'http://' + endpoint
  }
  const url = new URL(endpoint)
  const headers = z.record(z.string(), z.string()).parse(JSON.parse(config.request_headers || '{}'))
  if (url.username || url.password) {
    if (
      !Object.keys(headers).some((key) => {
        return key.toLowerCase() === 'authorization'
      })
    ) {
      headers.Authorization =
        'Basic ' +
        Buffer.from(decodeURIComponent(url.username) + ':' + decodeURIComponent(url.password)).toString(
          'base64'
        )
    }
    url.username = ''
    url.password = ''
  }
  return ComfyServiceSchema.parse({
    id: 'r_' + createHash('sha256').update(instance.id).digest('hex').slice(0, 30),
    name: instance.name,
    kind: 'comfy',
    enabled: instance.enabled,
    url: url.toString().replace(/\/$/u, ''),
    headers,
    timeoutMs: config.request_timeout_ms,
    maxHistoryBytes: maximumBytes,
    maxImageBytes: maximumBytes,
    sourceCompatible: true
  })
}
