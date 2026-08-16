# RoBridge docs site

Public documentation for RoBridge (MCP server + Studio plugin + local dashboard).

## Run locally

From this directory:

```bash
npm install
npm run dev
```

Then open [http://localhost:4000/docs](http://localhost:4000/docs).

`npm run dev` regenerates `lib/catalog.generated.json` from `src/tools/*.ts` (`defineTool` schemas) before Next.js starts. Port **4000** avoids clashing with the RoBridge dashboard on **3737**.

## Build static HTML

```bash
npm run build
npm start
```

`next.config.ts` uses `output: "export"`. Deploy the `web/out` folder to any static host when you have a URL. No production docs URL is wired yet.

## Pages

| Route | Content |
| --- | --- |
| `/` | Thin home linking to docs |
| `/docs` | Overview |
| `/docs/install` | First run |
| `/docs/mcp` | Cursor MCP config |
| `/docs/playtesting` | `run_test` / Play |
| `/docs/dashboard` | Local dashboard :3737 |
| `/docs/tools` | Tool schemas from source |
| `/docs/troubleshooting` | No session, Play, CaptureService |
| `/docs/limits` | Port, InsertService, no Open Cloud |
