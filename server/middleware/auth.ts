import process from "node:process"
import { jwtVerify } from "jose"

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith("/api")) return
  // The private local workbench is independent of upstream GitHub OAuth.
  if (url.pathname.startsWith("/api/cf/")) {
    const origin = getHeader(event, "origin")
    if (!["GET", "HEAD", "OPTIONS"].includes(event.method) && origin && origin !== url.origin)
      throw createError({ statusCode: 403, message: "只允许从当前工作台发起操作" })
    return
  }
  if (["JWT_SECRET", "G_CLIENT_ID", "G_CLIENT_SECRET"].find(k => !process.env[k])) {
    event.context.disabledLogin = true
    if (["/api/s", "/api/proxy", "/api/latest"].every(p => !url.pathname.startsWith(p)))
      throw createError({ statusCode: 506, message: "Server not configured, disable login" })
  } else {
    if (["/api/s", "/api/me"].find(p => url.pathname.startsWith(p))) {
      const token = getHeader(event, "Authorization")?.replace(/Bearer\s*/, "")?.trim()
      if (token) {
        try {
          const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET)) as { payload?: { id: string, type: string } }
          if (payload?.id) {
            event.context.user = {
              id: payload.id,
              type: payload.type,
            }
          }
        } catch {
          if (url.pathname.startsWith("/api/me"))
            throw createError({ statusCode: 401, message: "JWT verification failed" })
          else logger.warn("JWT verification failed")
        }
      } else if (url.pathname.startsWith("/api/me")) {
        throw createError({ statusCode: 401, message: "JWT verification failed" })
      }
    }
  }
})
