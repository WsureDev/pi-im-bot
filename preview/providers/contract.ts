import type { ProviderDeclaration, ResourceDescriptor } from '../contracts/resources'
import type { ConfigValues } from '../../src/plugins/configuration/schema'

/** Self-authored fixtures only. Production uses isolated plugin RPC, not imports into Core. */
export interface PreviewProvider {
  declaration: ProviderDeclaration
  discover(configuration: Readonly<ConfigValues>, signal: AbortSignal): Promise<ResourceDescriptor[]>
  invoke(
    request: {
      operationId: string
      externalId: string
      parameters: Readonly<ConfigValues>
      configuration: Readonly<ConfigValues>
      resourceConfiguration: Readonly<ConfigValues>
      requestId: string
    },
    signal: AbortSignal
  ): Promise<ConfigValues>
}
