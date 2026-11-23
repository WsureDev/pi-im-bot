import type { ResourceNativeContext } from './contracts'
export async function nativeDocument(context: ResourceNativeContext, name: string, value: unknown) {
  const content = JSON.stringify(value)
  if (Buffer.byteLength(content) <= 49152) {
    return { value, artifactIds: [] }
  }
  const artifact = await context.artifacts.save(name, 'application/json', 'resource-document', content)
  return {
    value: { documentArtifactId: artifact.id, bytes: Buffer.byteLength(content) },
    artifactIds: [artifact.id]
  }
}
