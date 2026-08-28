#!/usr/bin/env node

import { createServer } from 'http';
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, rmSync } from 'fs';
import { resolve, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, 'cache');
const THEMES_DIR = resolve(__dirname, 'themes');
const MANIFEST_PATH = resolve(__dirname, 'manifest.json');
const PORT = parseInt(process.env.RENDER_MD_PORT || '4747', 10);
const DEFAULT_THEME = 'rose-pine';
const CONTENT_DIR = resolve(__dirname, 'content');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

// d3dev-style favicon: purple rounded square with lightning bolt
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#c4a7e7"/>
  <path d="M17 5L8 17h6l-2 10 9-12h-6l2-10z" fill="#191724"/>
</svg>`;

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return [];
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch { return []; }
}

function listThemes() {
  return readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => f.replace('.css', ''));
}

function parseFrontMatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('---', 3);
  if (end === -1) return null;
  const yaml = content.slice(3, end).trim();
  const meta = {};
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;
    let [, key, val] = match;
    val = val.replace(/^"|"$/g, '').trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim());
    }
    meta[key] = val;
  }
  return meta;
}

function loadResearchArticles() {
  if (!existsSync(CONTENT_DIR)) return [];
  const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md') && f !== 'AGENTS.md');
  const articles = [];
  for (const file of files) {
    try {
      const content = readFileSync(resolve(CONTENT_DIR, file), 'utf8');
      const meta = parseFrontMatter(content);
      if (!meta || !meta.title) continue;
      articles.push({
        title: meta.title,
        date: meta.date || '',
        slug: meta.slug || file.replace('.md', ''),
        summary: meta.summary || '',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        type: meta.type || 'digest',
        source: meta.source || '',
        author: meta.author || '',
        sources: meta.sources || '',
        file
      });
    } catch {}
  }
  return articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDashboard() {
  const allEntries = loadManifest().sort((a, b) => new Date(b.rendered) - new Date(a.rendered));
  const entries = allEntries.filter(e => !e.archived);
  const archivedCount = allEntries.length - entries.length;
  const themes = listThemes();

  const themeOptions = themes.map(t =>
    `<option value="${t}"${t === DEFAULT_THEME ? ' selected' : ''}>${t.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</option>`
  ).join('\n        ');

  const rows = entries.map(e => {
    const date = new Date(e.rendered).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const title = escapeHtml(e.title);
    const source = escapeHtml(e.source || '');
    const theme = escapeHtml(e.theme || 'dark');
    return `
      <tr class="entry" data-search="${title.toLowerCase()} ${source.toLowerCase()} ${theme.toLowerCase()}">
        <td><a href="/cache/${encodeURIComponent(e.file)}">${title}</a></td>
        <td class="meta">${theme}</td>
        <td class="meta">${date}</td>
        <td class="source" title="${source}">${source.split('/').slice(-2).join('/')}</td>
        <td class="actions"><button class="archive-btn" data-file="${encodeURIComponent(e.file)}" title="Archive">✕</button></td>
      </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Render MD</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/themes/${DEFAULT_THEME}.css" id="theme-link">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  min-height: 100vh;
  max-width: none;
  padding: 0;
}
.shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px 40px;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  max-width: 960px;
  margin: 0 auto;
}
.logo {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}
.logo svg { width: 100%; height: 100%; }
.site-name {
  font-size: 1.1em;
  font-weight: 600;
  text-decoration: none;
  color: inherit;
  margin-right: 8px;
}
.nav-tabs {
  display: flex;
  gap: 4px;
}
.nav-tab {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
  cursor: pointer;
}
.nav-tab:hover {
  opacity: 0.8;
  background: rgba(128, 128, 128, 0.1);
  text-decoration: none;
}
.nav-tab.active {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
  font-weight: 500;
}
.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.count {
  font-size: 13px;
  opacity: 0.5;
  padding: 4px 10px;
  border-radius: 12px;
}
.theme-select {
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  cursor: pointer;
}
.theme-select:hover {
  border-color: rgba(128, 128, 128, 0.6);
}
.search-bar {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  color: inherit;
  margin-bottom: 20px;
  outline: none;
  transition: border-color 0.15s;
}
.search-bar:focus { border-color: rgba(128, 128, 128, 0.5); }
.search-bar::placeholder { opacity: 0.4; color: inherit; }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}
td {
  padding: 10px 12px;
  font-size: 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}
tr:hover { background: rgba(128, 128, 128, 0.08); }
a { font-weight: 500; }
.meta { opacity: 0.5; font-size: 13px; }
.source {
  opacity: 0.4;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  text-align: center;
  opacity: 0.4;
  padding: 60px 0;
  font-size: 15px;
}
.hidden { display: none; }
kbd {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  opacity: 0.6;
}
.hint { font-size: 12px; opacity: 0.35; margin-bottom: 16px; }
h1, h2 { border-bottom: none; padding-bottom: 0; }

/* Article list (research tab) */
.article-list {
  list-style: none;
  padding: 0;
}
.article-item {
  padding: 16px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}
.article-item a {
  font-size: 15px;
  font-weight: 500;
}
.article-item .article-meta {
  font-size: 13px;
  opacity: 0.5;
  margin-top: 4px;
}
.article-item .summary {
  font-size: 14px;
  opacity: 0.6;
  margin-top: 6px;
  line-height: 1.5;
}
.tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.15);
  opacity: 0.7;
  margin-left: 4px;
}

/* HN tab */
.hn-list {
  list-style: none;
  padding: 0;
  counter-reset: hn;
}
.hn-item {
  padding: 12px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.08);
  display: flex;
  gap: 12px;
  align-items: baseline;
}
.hn-item::before {
  counter-increment: hn;
  content: counter(hn) ".";
  opacity: 0.3;
  font-size: 13px;
  min-width: 24px;
  text-align: right;
}
.hn-item a {
  font-size: 14px;
  font-weight: 500;
}
.hn-item .hn-domain {
  font-size: 12px;
  opacity: 0.4;
  margin-left: 6px;
}
.hn-item .hn-meta {
  font-size: 12px;
  opacity: 0.45;
  margin-top: 3px;
}
.hn-item .hn-meta a {
  font-weight: 400;
  font-size: 12px;
}
.hn-content { flex: 1; }


.tab-content { display: none; }
.tab-content.active { display: block; }

.loading {
  text-align: center;
  opacity: 0.4;
  padding: 40px 0;
}

.article-body { line-height: 1.7; padding: 20px 0; }

/* Article layout with sidebar TOC */
.article-layout {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}
.article-main {
  flex: 1;
  min-width: 0;
}
.article-toc {
  position: sticky;
  top: 20px;
  width: 220px;
  flex-shrink: 0;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  font-size: 13px;
  padding: 12px 0;
  border-left: 1px solid rgba(128, 128, 128, 0.15);
  padding-left: 16px;
}
.article-toc ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.article-toc li {
  margin: 0;
  padding: 0;
}
.article-toc a {
  display: block;
  padding: 4px 0;
  opacity: 0.45;
  font-weight: 400;
  text-decoration: none;
  color: inherit;
  transition: opacity 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.article-toc a:hover {
  opacity: 0.8;
  text-decoration: none;
}
.article-toc a.active {
  opacity: 1;
  font-weight: 600;
}
.article-toc .toc-h3 {
  padding-left: 12px;
  font-size: 12px;
}
.article-toc-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.35;
  margin-bottom: 8px;
}
@media (max-width: 860px) {
  .article-layout { flex-direction: column; }
  .article-toc {
    position: static;
    width: 100%;
    max-height: none;
    border-left: none;
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    padding-left: 0;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
}
.article-body h1 { font-size: 2em; border-bottom: 1px solid rgba(128, 128, 128, 0.2); padding-bottom: .3em; margin: 1em 0 0.4em; }
.article-body h2 { font-size: 1.5em; border-bottom: 1px solid rgba(128, 128, 128, 0.2); padding-bottom: .3em; margin: 1.2em 0 0.4em; }
.article-body h3 { font-size: 1.25em; margin: 1em 0 0.4em; }
.article-body h4, .article-body h5, .article-body h6 { margin: 1em 0 0.4em; }
.article-body p { margin: 0.8em 0; }
.article-body ul, .article-body ol { padding-left: 2em; margin: 0.8em 0; }
.article-body li { margin: 0.25em 0; }
.article-body code {
  background: rgba(128, 128, 128, 0.15);
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-size: 85%;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
}
.article-body pre {
  background: rgba(0, 0, 0, 0.2);
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 85%;
  line-height: 1.45;
  margin: 1em 0;
  border: 1px solid rgba(128, 128, 128, 0.2);
}
.article-body pre code { background: none; padding: 0; }
.article-body blockquote {
  border-left: 4px solid currentColor;
  padding-left: 16px;
  opacity: 0.7;
  margin: 1em 0;
  font-style: italic;
}
.article-body a { text-decoration: none; }
.article-body a:hover { text-decoration: underline; }
.article-body table { border-collapse: collapse; width: 100%; margin: 16px 0; }
.article-body th, .article-body td { border: 1px solid rgba(128, 128, 128, 0.2); padding: 6px 13px; }
.article-body th { background: rgba(128, 128, 128, 0.1); font-weight: 600; }
.article-body tr:nth-child(2n) { background: rgba(128, 128, 128, 0.05); }
.article-body hr { border: none; border-top: 1px solid rgba(128, 128, 128, 0.2); margin: 24px 0; }
.article-body img { max-width: 100%; }
.back-link { opacity: 0.5; font-size: 13px; margin-bottom: 16px; display: block; }
.actions { width: 36px; text-align: center; }
.archive-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.2;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: opacity 0.15s, background 0.15s;
}
.archive-btn:hover {
  opacity: 0.7;
  background: rgba(128, 128, 128, 0.15);
}
.archive-toggle {
  font-size: 13px;
  opacity: 0.4;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
  padding: 4px 0;
  margin-top: 16px;
}
.archive-toggle:hover { opacity: 0.7; }
</style>
</head>
<body>
<header>
  <a href="#/" class="logo" title="Home">
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#c4a7e7"/>
      <path d="M17 5L8 17h6l-2 10 9-12h-6l2-10z" fill="#191724"/>
    </svg>
  </a>
  <a href="#/" class="site-name">render-md</a>
  <nav class="nav-tabs">
    <a href="#/" class="nav-tab" data-tab="index">Index</a>
    <a href="#/research" class="nav-tab" data-tab="research">Research</a>
    <a href="#/hn" class="nav-tab" data-tab="hn">Hacker News</a>
    <a href="#/show" class="nav-tab" data-tab="show">Show HN</a>
  </nav>
  <div class="header-right">
    <span class="count" id="count">${entries.length} file${entries.length !== 1 ? 's' : ''}</span>
    <select class="theme-select" id="theme-switcher" title="Switch theme">
      ${themeOptions}
    </select>
  </div>
</header>
<div class="shell">
  <!-- Index tab -->
  <div class="tab-content active" id="tab-index">
    <input type="text" class="search-bar" id="search" placeholder="Search by title, theme, or source path...">
    <p class="hint"><kbd>/</kbd> to focus search</p>
    ${entries.length === 0
      ? '<p class="empty">No renders yet. Use <code>render-md file.md --open</code> to get started.</p>'
      : `<table>
      <thead><tr><th>Title</th><th>Theme</th><th>Rendered</th><th>Source</th><th></th></tr></thead>
      <tbody id="entries">${rows}</tbody>
    </table>
    ${archivedCount > 0 ? `<button class="archive-toggle" id="show-archived">Show ${archivedCount} archived</button>` : ''}`}
  </div>

  <!-- Research tab -->
  <div class="tab-content" id="tab-research">
    <div id="research-content">
      <p class="loading">Loading research articles...</p>
    </div>
  </div>

  <!-- Hacker News tab -->
  <div class="tab-content" id="tab-hn">
    <div id="hn-content">
      <p class="loading">Loading Hacker News...</p>
    </div>
  </div>

  <!-- Show HN tab -->
  <div class="tab-content" id="tab-show">
    <div id="show-content">
      <p class="loading">Loading Show HN...</p>
    </div>
  </div>
</div>

<script>
// ─── Theme switching ───
(function() {
  const themeLink = document.getElementById('theme-link');
  const switcher = document.getElementById('theme-switcher');
  const saved = localStorage.getItem('render-md-dashboard-theme');
  if (saved) {
    themeLink.href = '/themes/' + saved + '.css';
    switcher.value = saved;
  }
  switcher.addEventListener('change', (e) => {
    const name = e.target.value;
    themeLink.href = '/themes/' + name + '.css';
    localStorage.setItem('render-md-dashboard-theme', name);
  });
})();

// ─── Search (index tab) ───
const search = document.getElementById('search');
const indexEntries = document.querySelectorAll('.entry');
search.addEventListener('input', () => {
  const q = search.value.toLowerCase();
  indexEntries.forEach(row => {
    row.classList.toggle('hidden', !row.dataset.search.includes(q));
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== search) {
    e.preventDefault();
    search.focus();
  }
});

// ─── Archive ───
document.getElementById('tab-index').addEventListener('click', async (e) => {
  const btn = e.target.closest('.archive-btn');
  if (!btn) return;
  const file = btn.dataset.file;
  const row = btn.closest('tr');
  try {
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: decodeURIComponent(file) })
    });
    if (res.ok) {
      row.style.opacity = '0';
      row.style.transition = 'opacity 0.25s';
      setTimeout(() => row.remove(), 250);
      // Update count
      const countEl = document.getElementById('count');
      const remaining = document.querySelectorAll('#entries .entry').length - 1;
      countEl.textContent = remaining + ' file' + (remaining !== 1 ? 's' : '');
    }
  } catch {}
});

const showArchivedBtn = document.getElementById('show-archived');
if (showArchivedBtn) {
  showArchivedBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/archived');
      const archived = await res.json();
      if (!archived.length) return;
      const tbody = document.getElementById('entries');
      archived.forEach(e => {
        const date = new Date(e.rendered).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const src = (e.source || '').split('/').slice(-2).join('/');
        const tr = document.createElement('tr');
        tr.className = 'entry';
        tr.dataset.search = (e.title + ' ' + (e.source || '') + ' ' + (e.theme || '')).toLowerCase();
        tr.style.opacity = '0.5';
        tr.innerHTML = '<td><a href="/cache/' + encodeURIComponent(e.file) + '">' + e.title + '</a></td>' +
          '<td class="meta">' + (e.theme || 'dark') + '</td>' +
          '<td class="meta">' + date + '</td>' +
          '<td class="source" title="' + (e.source || '') + '">' + src + '</td>' +
          '<td class="actions"><button class="archive-btn" data-file="' + encodeURIComponent(e.file) + '" data-restore="1" title="Restore">&#x21a9;</button></td>';
        tbody.appendChild(tr);
      });
      showArchivedBtn.remove();
    } catch {}
  });
}

// Handle restore clicks (on dynamically added archived rows)
document.getElementById('tab-index').addEventListener('click', async (e) => {
  const btn = e.target.closest('.archive-btn[data-restore]');
  if (!btn) return;
  const file = btn.dataset.file;
  const row = btn.closest('tr');
  try {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: decodeURIComponent(file) })
    });
    if (res.ok) {
      row.style.opacity = '1';
      btn.removeAttribute('data-restore');
      btn.innerHTML = '\u2715';
      btn.title = 'Archive';
    }
  } catch {}
});

// ─── Research tab ───
let researchLoaded = false;

async function loadResearch() {
  if (researchLoaded) return;
  const el = document.getElementById('research-content');
  try {
    const res = await fetch('/api/research');
    const articles = await res.json();
    if (!articles.length) {
      el.innerHTML = '<p class="empty">No research articles yet.</p>';
      researchLoaded = true;
      return;
    }
    const sorted = articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const list = sorted.map(a => {
      const date = new Date(a.date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      const tags = (a.tags || []).map(t => '<span class="tag">' + t + '</span>').join(' ');
      return '<li class="article-item">' +
        '<a href="#/research/' + a.slug + '">' + a.title + '</a>' +
        '<div class="article-meta">' + date + ' ' + tags + '</div>' +
        (a.summary ? '<p class="summary">' + a.summary + '</p>' : '') +
        '</li>';
    }).join('');
    el.innerHTML = '<ul class="article-list">' + list + '</ul>';
    researchLoaded = true;
  } catch (e) {
    el.innerHTML = '<p class="empty">Failed to load research articles.</p>';
  }
}

async function loadArticle(slug) {
  researchLoaded = false;
  const el = document.getElementById('research-content');
  el.innerHTML = '<p class="loading">Loading article...</p>';
  try {
    const res = await fetch('/content/' + slug + '.md');
    const md = await res.text();
    // Strip front matter
    let body = md;
    if (body.startsWith('---')) {
      const end = body.indexOf('---', 3);
      if (end !== -1) body = body.slice(end + 3).trim();
    }
    const html = marked.parse(body);
    el.innerHTML = '<a href="#/research" class="back-link">&larr; Back to research</a>' +
      '<div class="article-layout">' +
        '<div class="article-main"><div class="article-body">' + html + '</div></div>' +
        '<nav class="article-toc" id="article-toc"></nav>' +
      '</div>';
    buildArticleTOC();
  } catch (e) {
    el.innerHTML = '<a href="#/research" class="back-link">&larr; Back to research</a>' +
      '<p class="empty">Article not found.</p>';
  }
}

function buildArticleTOC() {
  const toc = document.getElementById('article-toc');
  const article = document.querySelector('.article-body');
  if (!toc || !article) return;
  const headings = article.querySelectorAll('h1, h2, h3');
  if (headings.length < 2) { toc.style.display = 'none'; return; }
  let tocHTML = '<div class="article-toc-title">Contents</div><ul>';
  headings.forEach(function(h, i) {
    var id = 'toc-' + i;
    h.id = id;
    var level = h.tagName === 'H3' ? ' toc-h3' : '';
    tocHTML += '<li><a href="javascript:void(0)" class="toc-link' + level + '" data-target="' + id + '">' + h.textContent + '</a></li>';
  });
  tocHTML += '</ul>';
  toc.innerHTML = tocHTML;
  // Click handlers
  toc.querySelectorAll('.toc-link').forEach(function(link) {
    link.addEventListener('click', function() {
      var target = document.getElementById(link.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  // Scroll spy
  var links = toc.querySelectorAll('.toc-link');
  var headingEls = Array.from(headings);
  function onScroll() {
    var scrollY = window.scrollY + 80;
    var current = 0;
    for (var i = 0; i < headingEls.length; i++) {
      if (headingEls[i].offsetTop <= scrollY) current = i;
    }
    links.forEach(function(l, j) {
      l.classList.toggle('active', j === current);
    });
  }
  window.addEventListener('scroll', onScroll);
  onScroll();
  // Cleanup on navigation
  window.addEventListener('hashchange', function cleanup() {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', cleanup);
  });
}

// Use marked.parse() loaded from CDN — no local renderer needed

// ─── Hacker News tab ───
let hnLoaded = false;

function renderHNList(stories) {
  return stories.map(s => {
    const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
    const hnLink = 'https://news.ycombinator.com/item?id=' + s.id;
    return '<li class="hn-item">' +
      '<div class="hn-content">' +
      '<div><a href="' + (s.url || hnLink) + '" target="_blank" rel="noopener">' + s.title + '</a>' +
      (domain ? '<span class="hn-domain">(' + domain + ')</span>' : '') +
      '</div>' +
      '<div class="hn-meta">' + s.score + ' pts &middot; ' +
      '<a href="' + hnLink + '" target="_blank" rel="noopener">' + (s.descendants || 0) + ' comments</a></div>' +
      '</div></li>';
  }).join('');
}

async function fetchHNStories(endpoint) {
  const res = await fetch('https://hacker-news.firebaseio.com/v0/' + endpoint + '.json');
  const ids = (await res.json()).slice(0, 30);
  return Promise.all(
    ids.map(id => fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json').then(r => r.json()))
  );
}

async function loadHN() {
  if (hnLoaded) return;
  const el = document.getElementById('hn-content');
  try {
    const stories = await fetchHNStories('topstories');
    el.innerHTML = '<ul class="hn-list">' + renderHNList(stories) + '</ul>';
    hnLoaded = true;
  } catch (e) {
    el.innerHTML = '<p class="empty">Failed to load Hacker News.</p>';
  }
}

let showLoaded = false;
async function loadShowHN() {
  if (showLoaded) return;
  const el = document.getElementById('show-content');
  try {
    const stories = await fetchHNStories('showstories');
    el.innerHTML = '<ul class="hn-list">' + renderHNList(stories) + '</ul>';
    showLoaded = true;
  } catch (e) {
    el.innerHTML = '<p class="empty">Failed to load Show HN.</p>';
  }
}

// ─── Routing ───
function updateTabs(active) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === active);
  });
  document.querySelectorAll('.tab-content').forEach(tc => {
    tc.classList.toggle('active', tc.id === 'tab-' + active);
  });
}

function route() {
  const hash = window.location.hash || '#/';
  if (hash === '#/hn') {
    updateTabs('hn');
    loadHN();
  } else if (hash === '#/show') {
    updateTabs('show');
    loadShowHN();
  } else if (hash === '#/research') {
    updateTabs('research');
    loadResearch();
  } else if (hash.startsWith('#/research/')) {
    updateTabs('research');
    const slug = hash.slice('#/research/'.length);
    loadArticle(slug);
  } else {
    updateTabs('index');
  }
}

window.addEventListener('hashchange', route);
route();
</script>
</body>
</html>`;
}

function serveStatic(filePath, res) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderDashboard());
    return;
  }

  // Serve favicon
  if (pathname === '/favicon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(FAVICON_SVG);
    return;
  }

  // API: archive a file
  if (pathname === '/api/archive' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { file } = JSON.parse(body);
        const manifest = loadManifest();
        const entry = manifest.find(e => e.file === file);
        if (entry) {
          entry.archived = true;
          writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400);
        res.end('{"error":"bad request"}');
      }
    });
    return;
  }

  // API: restore an archived file
  if (pathname === '/api/restore' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { file } = JSON.parse(body);
        const manifest = loadManifest();
        const entry = manifest.find(e => e.file === file);
        if (entry) {
          delete entry.archived;
          writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400);
        res.end('{"error":"bad request"}');
      }
    });
    return;
  }

  // API: get archived entries
  if (pathname === '/api/archived' && req.method === 'GET') {
    const archived = loadManifest()
      .filter(e => e.archived)
      .sort((a, b) => new Date(b.rendered) - new Date(a.rendered));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(archived));
    return;
  }

  // Serve theme CSS from themes/ directory
  if (pathname.startsWith('/themes/')) {
    const relative = pathname.slice('/themes/'.length);
    const filePath = resolve(THEMES_DIR, relative);
    if (!filePath.startsWith(THEMES_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveStatic(filePath, res);
    return;
  }

  // API: research articles manifest (from local content/)
  if (pathname === '/api/research' && req.method === 'GET') {
    const articles = loadResearchArticles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(articles));
    return;
  }

  // Serve content/ markdown files
  if (pathname.startsWith('/content/')) {
    const relative = pathname.slice('/content/'.length);
    const filePath = resolve(CONTENT_DIR, relative);
    if (!filePath.startsWith(CONTENT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveStatic(filePath, res);
    return;
  }

  // Serve from cache/
  if (pathname.startsWith('/cache/')) {
    const relative = pathname.slice('/cache/'.length);
    const filePath = resolve(CACHE_DIR, relative);
    if (!filePath.startsWith(CACHE_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveStatic(filePath, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  \ud83d\udcc4 Render MD Dashboard`);
  console.log(`  \u2192 http://localhost:${PORT}\n`);
  console.log(`  Serving ${loadManifest().length} rendered file(s) from cache/`);
  console.log(`  Ctrl+C to stop\n`);
});
