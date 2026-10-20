import "~/styles/factory.css"
import "virtual:uno.css"
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})

function NotFoundComponent() {
  return <div className="not-found"><h1>这个页面暂时不存在</h1><a href="/">回到热点工作台</a></div>
}

function RootComponent() {
  return <Outlet />
}
