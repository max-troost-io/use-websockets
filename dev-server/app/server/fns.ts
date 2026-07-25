import { createServerFn } from '@tanstack/react-start'
import {
  activateBlock,
  deactivateBlock,
  dropAllClients,
  pushNewSession,
  setIgnorePings,
} from './ws'

export const dropAndBlock = createServerFn({ method: 'POST' })
  .validator((data: { blockForMs: number | null }) => data)
  .handler(async ({ data }) => {
    dropAllClients()
    if (data.blockForMs !== 0) {
      activateBlock(data.blockForMs)
    }
  })

export const releaseBlock = createServerFn({ method: 'POST' })
  .handler(async () => {
    deactivateBlock()
  })

export const setIgnoreHeartbeats = createServerFn({ method: 'POST' })
  .validator((data: { ignore: boolean }) => data)
  .handler(async ({ data }) => {
    setIgnorePings(data.ignore)
  })

export const triggerNewSession = createServerFn({ method: 'POST' })
  .handler(async () => {
    pushNewSession()
  })
