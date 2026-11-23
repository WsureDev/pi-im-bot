import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { z } from 'zod'
import { ArtifactStore } from '../src/artifacts/store'
import { recordedResourceRequest } from '../src/resource-providers/native/request-record'
import { ResourceDependencySchema, ResourceInstanceSchema } from '../src/resource-providers/protocol'
import { comfyErrorDetail } from '../src/services/comfy/error-detail'
import { ComfyServiceSchema } from '../src/services/comfy/resources'

test('committed native model result survives post-completion authorization failure and never invokes the model twice', async () => {
  const directory = await mkdtemp('/tmp/pi-native-request-')
  let calls = 0
  let authorization = 0
  let rejectAfterCommit = true
  try {
    const instance = ResourceInstanceSchema.parse({
      id: 'model',
      name: 'Authored',
      provider: 'framework-model',
      enabled: true
    })
    const context = {
      dataDir: directory,
      artifacts: new ArtifactStore(directory, 'fixture'),
      owner: { scope: 'fixture', caller: 'plugin', phase: 'execute' as const },
      signal: AbortSignal.timeout(10000),
      requestId: 'stable',
      authorize() {
        authorization += 1
        if (rejectAfterCommit && authorization === 3) {
          throw new Error('revoked after complete')
        }
      }
    }
    async function request() {
      calls += 1
      return { text: 'saved result' }
    }
    await expect(
      recordedResourceRequest(instance, context, 'fingerprint', z.object({ text: z.string() }), request)
    ).rejects.toThrow('revoked')
    rejectAfterCommit = false
    expect(
      await recordedResourceRequest(instance, context, 'fingerprint', z.object({ text: z.string() }), request)
    ).toEqual({ text: 'saved result' })
    expect(calls).toBe(1)
    await expect(
      recordedResourceRequest(instance, context, 'changed', z.object({ text: z.string() }), request)
    ).rejects.toThrow('不同参数')
    expect(calls).toBe(1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('source node validation errors preserve actionable details while credential echoes are removed', async () => {
  const service = ComfyServiceSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    kind: 'comfy',
    enabled: true,
    url: 'http://127.0.0.1:1',
    headers: { Authorization: 'Bearer AUTHORED_PRIVATE_TOKEN' }
  })
  const response = Response.json(
    {
      error: { message: 'Workflow invalid', details: 'AUTHORED_PRIVATE_TOKEN' },
      node_errors: {
        '6': {
          class_type: 'TextEncode',
          errors: [{ message: 'Missing input', extra_info: { input_name: 'text' } }]
        }
      }
    },
    { status: 400 }
  )
  const detail = await comfyErrorDetail(response, service)
  expect(detail).toContain('节点 6 (TextEncode) 输入 text')
  expect(detail).toContain('Missing input')
  expect(detail).not.toContain('AUTHORED_PRIVATE_TOKEN')
})
test('resource projections reject prototype paths and retain independently declared configuration options', () => {
  expect(
    ResourceDependencySchema.safeParse({
      alias: 'speech',
      protocol: 'pi.gsvi@1',
      methods: ['synthesize'],
      configurationProjection: { provider: 'gsvi-http', fields: { 'constructor.secret': 'api_key' } }
    }).success
  ).toBe(false)
  expect(
    ResourceDependencySchema.parse({
      alias: 'speech',
      protocol: 'pi.gsvi@1',
      methods: ['synthesize'],
      options: [{ field: 'preset.voice', method: 'voice_options', parameters: { version: 'version' } }]
    }).options
  ).toHaveLength(1)
})

test('native static model inspection handles incomplete inactive LoRA entries without discarding active evidence', async () => {
  const { inspectModels } = await import('../src/resource-providers/native/comfy/models')
  const result = inspectModels({
    '1': {
      class_type: 'Lora Loader (LoraManager)',
      inputs: {
        loras: {
          __value__: [{ active: false }, { active: true }, { name: 'chosen.safetensors', active: true }]
        }
      }
    }
  })
  expect(result.inactive_lora_count).toBe(1)
  expect(
    result.models.map((model) => {
      return model.filename
    })
  ).toEqual(['chosen.safetensors'])
  expect(result.unresolved_inputs[0].reason).toBe('启用的 LoRA 缺少文件名')
  expect(result.unrecognized_loaders).toHaveLength(0)
})

test('saving a native workflow announces fresh configuration choices without requiring a plugin worker or backend request', async () => {
  const directory = await mkdtemp('/tmp/pi-workflow-options-')
  try {
    const { comfyNativeAdapter } = await import('../src/resource-providers/native/comfy')
    const instance = ResourceInstanceSchema.parse({
      id: 'workflow-options',
      name: 'Fixture',
      provider: 'comfyui-http',
      enabled: true,
      configuration: { workflow_directory: directory }
    })
    const changed: string[] = []
    const result = await comfyNativeAdapter.invoke(
      instance,
      'workflow_save',
      { filename: 'fresh', value: { '1': { class_type: 'Text', inputs: {} } } },
      {
        dataDir: directory,
        artifacts: new ArtifactStore(directory, 'fixture'),
        owner: { scope: 'fixture', caller: 'fixture', phase: 'execute' },
        signal: AbortSignal.timeout(10000),
        requestId: 'save',
        authorize() {},
        optionsChanged(id) {
          changed.push(id)
        }
      }
    )
    expect(changed).toEqual(['workflow-options'])
    expect(z.object({ files: z.array(z.string()) }).parse(result.value).files).toContain('fresh.json')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
