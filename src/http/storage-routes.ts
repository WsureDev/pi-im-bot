import type { Hono } from 'hono'
import type { Configuration } from '../config/load'
import type { PluginService } from '../plugins/service'
import { artifactBudget } from '../artifacts/quota'

export function registerStorageRoutes(app: Hono, configuration: () => Configuration, plugins: PluginService) {
  app.get('/api/plugins/storage', async (c) => {
    return c.json({
      executionEnabled: plugins.available(),
      data: await plugins.manager.volumes.status(),
      artifacts: await artifactBudget(configuration().dataDir).status()
    })
  })
  app.post('/api/plugins/storage/reconcile', async (c) => {
    return c.json(await artifactBudget(configuration().dataDir).reconcile())
  })
}
