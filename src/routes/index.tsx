import { createFileRoute } from "@tanstack/react-router"
import { FactoryApp } from "~/factory/app"

export const Route = createFileRoute("/")({
  component: FactoryApp,
})
