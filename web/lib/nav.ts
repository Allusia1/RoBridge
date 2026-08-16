export const DOC_NAV = [
  {
    title: "Start",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/install", label: "Install" },
      { href: "/docs/mcp", label: "MCP setup" },
    ],
  },
  {
    title: "Guides",
    items: [
      { href: "/docs/playtesting", label: "Playtesting" },
      { href: "/docs/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Reference",
    items: [{ href: "/docs/tools", label: "Tools" }],
  },
  {
    title: "Help",
    items: [
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
      { href: "/docs/limits", label: "Limits" },
    ],
  },
] as const;
