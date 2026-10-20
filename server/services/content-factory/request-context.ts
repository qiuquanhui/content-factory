import { AsyncLocalStorage } from "node:async_hooks"

export const collectionContext = new AsyncLocalStorage<AbortSignal>()
