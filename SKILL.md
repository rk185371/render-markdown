---
name: render-markdown
description: >-
  Use when the user wants to preview a local markdown file in the browser
  as styled HTML with a navigable sidebar TOC. Triggers: "render this markdown",
  "preview markdown", "view as HTML", "render plan", "show me this .md file",
  "HTML preview", "pretty print markdown", "view plan".
---

# render-markdown

Zero-network, deterministic markdown-to-HTML renderer with theme support and sidebar TOC.

## When to use

- User wants to view a `.md` file rendered in the browser
- User says "render", "preview", or "view" a markdown file
- User wants to review a plan, spec, or doc with nice formatting

## When NOT to use

- Remote URLs — use `web_fetch` instead

## Configuration

Create `config.json` in the skill directory to set defaults:

```json
{
  "theme": "catppuccin-mocha"
}
```

The `--theme` flag still overrides the config per-invocation.

## Quick reference

| Action           | Command                                                       |
|------------------|---------------------------------------------------------------|
| Render           | `node ~/.pi/agent/skills/render-markdown/cli.mjs f.md`        |
| Choose theme     | `--theme catppuccin-mocha`                                    |
| Start dashboard  | `--serve` (foreground, http://localhost:4747)                 |
| Stop dashboard   | `--stop` (kills background server)                           |
| List themes      | `--help` (shows available themes)                             |
| List cached      | `--list`                                                      |
| Purge cache      | `--purge`                                                     |

## Available themes

`dark` (default), `light`, `catppuccin-mocha`, `rose-pine`, `gruvbox`

Themes are editable CSS files at `~/.pi/agent/skills/render-markdown/themes/`. Add new ones by dropping a `.css` file there.

## Dashboard server

A local browseable index of everything you've ever rendered.

```bash
node ~/.pi/agent/skills/render-markdown/cli.mjs --serve
# → http://localhost:4747
```

- **Auto-starts as a background daemon** on every render — no manual launch needed
- Reverse-chronological list of all renders
- Instant search by title, theme, or source path
- Click any entry to view the rendered HTML (with theme switching)
- Reads from `manifest.json` (auto-updated on each render)
- Zero dependencies — uses Node's built-in `http` module
- Port override: `RENDER_MD_PORT=8080 node ... --serve`
- Stop: `--stop` kills the background server

## Agent workflow

1. Render the file: `node ~/.pi/agent/skills/render-markdown/cli.mjs <file>`
2. If the user requests a specific theme: `node ~/.pi/agent/skills/render-markdown/cli.mjs <file> --theme <name>`
3. **Do NOT use `--open`.** Do NOT open the HTML file directly.
4. Tell the user: **"Rendered — view it at http://localhost:4747"**
5. The dashboard auto-starts in the background on every render.

The title shown in the dashboard index is extracted from the first `# Heading` in the markdown. If the markdown has no H1, the filename is used as fallback. Make sure your markdown files have a descriptive H1.

## Key behaviors

- **Smart titles** — the index shows the first H1 heading from the markdown, not the filename.
- **Deterministic filenames** — same .md + same theme = same output path. Re-run and refresh the browser.
- **Sidebar TOC** — auto-generated from H1/H2 headings with scroll-spy highlighting.
- **Cache folder** — output goes to `cache/` inside the skill dir. Use `--purge` to clean.
- **No network** — uses `npx marked` locally.

## Common mistakes

- **Using `--open`** — don't open the file directly. Point the user to http://localhost:4747 instead.
- **Theme name typo** — CLI exits with error listing available themes.
- **Expecting live reload** — this is a one-shot render. Edit the .md, re-run the command, refresh the tab.

## File structure

```
~/.pi/agent/skills/render-markdown/
  SKILL.md        — this file
  cli.mjs         — Node CLI script (render + manifest)
  server.mjs      — local dashboard server
  manifest.json   — index of all renders (auto-updated)
  config.json     — optional default theme config
  themes/         — editable CSS theme files
  cache/          — generated HTML output
    themes/       — CSS copies for runtime switching
```
