const paths: Record<string, string> = {
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  bookmark: "M6 4h12v17l-6-4-6 4V4Z",
  folder: "M3 7V5h7l2 3h9v12H3V7Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  external: "M14 3h7v7m0-7L10 14m0-10H4v16h16v-6",
  refresh: "M20 7v5h-5M4 17v-5h5m10-3a8 8 0 0 0-13-3L4 9m16 6-2 3a8 8 0 0 1-13-3",
  search: "M21 21l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  link: "m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8m-8 4h5",
  send: "m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
  alert: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
  globe: "M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Zm9 9a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
}
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  )
}
