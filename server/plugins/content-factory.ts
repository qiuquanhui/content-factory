import { factory, closeFactory } from "../services/content-factory/runtime"

export default defineNitroPlugin((nitroApp) => {
  const { collector } = factory()
  let start: ReturnType<typeof setTimeout> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  if (process.env.CF_AUTOCOLLECT !== "false") {
    start = setTimeout(() => collector.start("startup"), 1500)
    timer = setInterval(() => collector.start("schedule"), 60000)
  }
  nitroApp.hooks.hook("close", async () => {
    clearTimeout(start)
    clearInterval(timer)
    await closeFactory()
  })
})
