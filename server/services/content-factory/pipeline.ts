import type { Topic } from "../../../shared/content-factory"

/** Extension contracts only: later adapters must implement real writing/publishing. */
export interface WritingProvider {
  id: string
  generate: (
    input: { topic: Topic; styleProfileId: string; sources: { url: string; text: string }[] },
    signal: AbortSignal,
  ) => Promise<{
    title: string
    markdown: string
    citations: string[]
  }>
}

export interface PublishingProvider {
  id: string
  publish: (
    input: { articleId: string; title: string; markdown: string; idempotencyKey: string },
    signal: AbortSignal,
  ) => Promise<{
    externalId: string
    url: string
  }>
}

export class PipelineRegistry {
  readonly writers = new Map<string, WritingProvider>()
  readonly publishers = new Map<string, PublishingProvider>()
  registerWriter(provider: WritingProvider) {
    if (this.writers.has(provider.id)) throw new Error(`重复写作适配器：${provider.id}`)
    this.writers.set(provider.id, provider)
  }
  registerPublisher(provider: PublishingProvider) {
    if (this.publishers.has(provider.id)) throw new Error(`重复发布适配器：${provider.id}`)
    this.publishers.set(provider.id, provider)
  }
}
export const pipeline = new PipelineRegistry()
