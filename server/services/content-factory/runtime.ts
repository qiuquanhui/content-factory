import { FactoryStore } from "./store"
import { Collector } from "./collector"
import { providers } from "./providers"

let instance: { store: FactoryStore; collector: Collector } | null = null
export function factory() {
  if (!instance) {
    const store = new FactoryStore()
    store.recover()
    instance = { store, collector: new Collector(store, providers) }
  }
  return instance
}

export async function closeFactory() {
  if (instance) {
    await instance.collector.close()
    instance.store.close()
    instance = null
  }
}
