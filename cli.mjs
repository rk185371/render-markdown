#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { createConnection } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, 'cache');
const THEMES_DIR = resolve(__dirname, 'themes');
const CONFIG_PATH = resolve(__dirname, 'config.json');
const PID_PATH = resolve(__dirname, '.server.pid');
const PORT = parseInt(process.env.RENDER_MD_PORT || '4747', 10);

function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch { return {}; }
  }
  return {};
}

function usage() {
  console.log(`Usage: node ${resolve(__dirname, 'cli.mjs')} <file.md> [options]

Options:
  --theme <name>   Theme name (default: dark). Available: ${listThemes().join(', ')}
  --open           Open in browser after rendering
  --serve          Start dashboard server in foreground (port ${PORT})
  --stop           Stop background dashboard server
  --purge          Delete all cached HTML files
  --list           List cached files
  -h, --help       Show this help

The dashboard server auto-starts in the background on each render.
Browse at http://localhost:${PORT}

Examples:
  render-md ./plan.md --open
  render-md ./plan.md --theme catppuccin-mocha --open
  render-md --serve
  render-md --stop
  render-md --purge`);
  process.exit(0);
}

function listThemes() {
  return readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => f.replace('.css', ''));
}

function purgeCache() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.html'));
  files.forEach(f => rmSync(resolve(CACHE_DIR, f)));
  console.log(`Purged ${files.length} cached file(s).`);
  process.exit(0);
}

function listCache() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.html'));
  if (files.length === 0) {
    console.log('Cache is empty.');
  } else {
    files.forEach(f => console.log(resolve(CACHE_DIR, f)));
  }
  process.exit(0);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const conn = createConnection({ port, host: '127.0.0.1' });
    conn.on('connect', () => { conn.end(); resolve(true); });
    conn.on('error', () => { resolve(false); });
  });
}

function stopServer() {
  if (existsSync(PID_PATH)) {
    try {
      const pid = parseInt(readFileSync(PID_PATH, 'utf8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      rmSync(PID_PATH);
      console.log(`Stopped dashboard server (pid ${pid})`);
    } catch {
      rmSync(PID_PATH, { force: true });
      console.log('Server not running (stale pid removed).');
    }
  } else {
    console.log('Server not running.');
  }
}

async function ensureServer() {
  if (await isPortOpen(PORT)) return; // already running
  const child = spawn('node', [resolve(__dirname, 'server.mjs')], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, RENDER_MD_PORT: String(PORT) }
  });
  child.unref();
  writeFileSync(PID_PATH, String(child.pid));
}

function slugify(text) {
  return text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function buildToc(html) {
  const headingRegex = /<(h[1-2])[^>]*>(.*?)<\/\1>/gi;
  const entries = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1][1]);
    const text = match[2].replace(/<[^>]*>/g, '');
    const id = slugify(text);
    entries.push({ level, text, id });
  }
  return entries;
}

function addIdsToHeadings(html) {
  return html.replace(/<(h[1-3])([^>]*)>(.*?)<\/\1>/gi, (full, tag, attrs, content) => {
    const text = content.replace(/<[^>]*>/g, '');
    const id = slugify(text);
    return `<${tag}${attrs} id="${id}">${content}</${tag}>`;
  });
}

function renderTocHtml(entries) {
  if (entries.length === 0) return '';
  const items = entries.map(e =>
    `<a href="#${e.id}" data-id="${e.id}">${e.text}</a>`
  ).join('\n      ');
  return `
    <nav class="toc">
      <div class="toc-title">Contents</div>
      ${items}
    </nav>`;
}

// Parse args
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) usage();
if (args.includes('--purge')) purgeCache();
if (args.includes('--list')) listCache();
if (args.includes('--serve')) {
  execSync(`node ${resolve(__dirname, 'server.mjs')}`, { stdio: 'inherit' });
  process.exit(0);
}
if (args.includes('--stop')) {
  stopServer();
  process.exit(0);
}

const config = loadConfig();
let mdFile = null;
let theme = config.theme || 'dark';
let shouldOpen = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--theme') { theme = args[++i]; continue; }
  if (args[i] === '--open') { shouldOpen = true; continue; }
  if (!args[i].startsWith('-')) { mdFile = args[i]; }
}

if (!mdFile) {
  console.error('Error: No markdown file specified.');
  usage();
}

// Resolve paths
const mdPath = resolve(mdFile);

// Read inputs
let mdContent;
try {
  mdContent = readFileSync(mdPath, 'utf8');
} catch (e) {
  console.error(`Error: Cannot read ${mdPath}`);
  process.exit(1);
}
if (!listThemes().includes(theme)) {
  console.error(`Error: Theme "${theme}" not found. Available: ${listThemes().join(', ')}`);
  process.exit(1);
}

// Copy themes to cache for runtime switching
const cacheThemesDir = resolve(CACHE_DIR, 'themes');
mkdirSync(cacheThemesDir, { recursive: true });
const availableThemes = listThemes();
availableThemes.forEach(t => {
  const src = readFileSync(resolve(THEMES_DIR, `${t}.css`), 'utf8');
  writeFileSync(resolve(cacheThemesDir, `${t}.css`), src);
});

// Convert markdown to HTML via marked
let htmlBody;
try {
  htmlBody = execSync(`npx marked --gfm`, { input: mdContent, encoding: 'utf8' });
} catch (e) {
  console.error('Error: marked failed to convert markdown.');
  process.exit(1);
}

// Add IDs to headings and build TOC
htmlBody = addIdsToHeadings(htmlBody);
const tocEntries = buildToc(htmlBody);
const tocHtml = renderTocHtml(tocEntries);

// Build full HTML
const title = basename(mdPath, '.md');
// Build theme selector options
const themeOptions = availableThemes.map(t =>
  `<option value="${t}"${t === theme ? ' selected' : ''}>${t.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</option>`
).join('\n        ');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23c4a7e7'/><path d='M17 5L8 17h6l-2 10 9-12h-6l2-10z' fill='%23191724'/></svg>">
<link rel="stylesheet" href="themes/${theme}.css" id="theme-link">
<style>
/* Layout: sidebar + content */
body {
  display: flex;
  max-width: none;
  margin: 0;
  padding: 0;
}
.toc {
  position: fixed;
  top: 0;
  left: 0;
  width: 200px;
  height: 100vh;
  overflow-y: auto;
  padding: 20px 12px;
  box-sizing: border-box;
  border-right: 1px solid;
  border-color: inherit;
}
.toc-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.toc a {
  display: block;
  font-size: 13px;
  padding: 6px 8px;
  margin: 1px 0;
  border-radius: 4px;
  text-decoration: none;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.toc a:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
  text-decoration: none;
}
.toc a.active {
  opacity: 1;
  background: rgba(128, 128, 128, 0.2);
  border-left: 3px solid;
  border-color: inherit;
  padding-left: 5px;
}
.theme-selector {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 100;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.theme-selector:hover {
  border-color: rgba(128, 128, 128, 0.6);
}
.content {
  margin-left: 200px;
  padding: 40px 40px 40px 40px;
  min-height: 100vh;
}

/* Scroll behavior */
html { scroll-behavior: smooth; }
</style>
</head>
<body>
<select class="theme-selector" id="theme-switcher" title="Switch theme">
  ${themeOptions}
</select>
${tocHtml}
<main class="content">
${htmlBody}
<div class="source-footer">
  Source: ${mdPath}<br>
  Theme: <span id="theme-label">${theme}</span> · Rendered: ${new Date().toLocaleString()}
</div>
</main>
<script>
// Theme switching (no localStorage — each file respects its rendered theme)
(function() {
  const themeLink = document.getElementById('theme-link');
  const switcher = document.getElementById('theme-switcher');
  const label = document.getElementById('theme-label');
  switcher.addEventListener('change', (e) => {
    const name = e.target.value;
    themeLink.href = 'themes/' + name + '.css';
    if (label) label.textContent = name;
  });
})();

// Scroll spy — highlights active TOC item
(function() {
  const links = document.querySelectorAll('.toc a[data-id]');
  const ids = Array.from(links).map(a => a.dataset.id);
  const headings = ids.map(id => document.getElementById(id)).filter(Boolean);

  function update() {
    let active = headings[0];
    const offset = 80;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= offset) active = h;
    }
    links.forEach(a => {
      a.classList.toggle('active', a.dataset.id === active?.id);
    });
  }

  document.querySelector('.content')?.addEventListener('scroll', update);
  window.addEventListener('scroll', update);
  update();
})();
</script>
</body>
</html>`;

// Extract display title from first H1 heading, fall back to filename
function extractTitle(md) {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}
const displayTitle = extractTitle(mdContent) || title;

// Write to cache with deterministic filename
mkdirSync(CACHE_DIR, { recursive: true });
// const hash = createHash('md5').update(mdPath + ':' + theme).digest('hex').slice(0, 8);
const hash = '0'
const outFile = resolve(CACHE_DIR, `${title}-${theme}-${hash}.html`);
writeFileSync(outFile, html);
console.log(outFile);

// Save raw markdown to content/
const CONTENT_DIR = resolve(__dirname, 'content');
mkdirSync(CONTENT_DIR, { recursive: true });
const contentFilename = `${title}.md`;
writeFileSync(resolve(CONTENT_DIR, contentFilename), mdContent);

// Update manifest for dashboard
const MANIFEST_PATH = resolve(__dirname, 'manifest.json');
let manifest = [];
if (existsSync(MANIFEST_PATH)) {
  try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch {}
}
const outFilename = basename(outFile);
// Upsert: replace if same file already tracked
manifest = manifest.filter(e => e.file !== outFilename);
manifest.push({
  title: displayTitle,
  source: mdPath,
  theme,
  rendered: new Date().toISOString(),
  file: outFilename,
  content: contentFilename
});
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

// Ensure dashboard server is running in background
await ensureServer();

// Open if requested
if (shouldOpen) {
  execSync(`open "${outFile}"`);
}
