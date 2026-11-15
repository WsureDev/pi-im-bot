import type { Configuration } from '../config/load'
import type { Room } from '../domain/message'
import type { Run, PreparedRunInput } from '../domain/run'

export interface QueuedExecution {
  config: Configuration
  room: Room
  input: PreparedRunInput
  run: Run
  controller: AbortController
}
