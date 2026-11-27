// A deliberately small Markdown renderer for knowledge notes.
// Safety: every piece of text is HTML-escaped first; links are kept only for
// http(s) and relative targets; raw HTML in notes is shown as text, never rendered.

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Splits YAML frontmatter (simple key: value and lists) from the body. */
export function splitFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown || '');
  if (!match) return { frontmatter: {}, body: markdown || '' };
  const frontmatter = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      frontmatter[listKey].push(item[1].trim());
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const value = kv[2].trim();
    if (value === '') {
      frontmatter[kv[1]] = [];
      listKey = kv[1];
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[kv[1]] = value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean);
      listKey = null;
    } else {
      frontmatter[kv[1]] = value.replace(/^["'](.*)["']$/, '$1');
      listKey = null;
    }
  }
  return { frontmatter, body: match[2] };
}

function safeHref(href) {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // javascript:, data:, vbscript: …
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

function inline(text) {
  const codeSpans = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const unescaped = href.replace(/&amp;/g, '&');
    const safe = safeHref(unescaped);
    return safe ? `<a href="${escapeHtml(safe)}" rel="noopener noreferrer">${label}</a>` : label;
  });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
}

/** Reads list items starting at `start`; indented lines continue the previous item. */
function collectItems(lines, start, marker, items, setIndex) {
  let i = start;
  while (i < lines.length) {
    if (marker.test(lines[i])) items.push(lines[i++].replace(marker, ''));
    else if (items.length && /^\s{2,}\S/.test(lines[i])) items[items.length - 1] += ` ${lines[i++].trim()}`;
    else break;
  }
  setIndex(i);
}

/** Converts a Markdown body to safe HTML. */
export function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      collectItems(lines, i, /^\s*[-*]\s+/, items, (next) => (i = next));
      html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      collectItems(lines, i, /^\s*\d+\.\s+/, items, (next) => (i = next));
      html.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      html.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) para.push(lines[i++]);
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return html.join('\n');
}
