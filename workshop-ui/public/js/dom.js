// Small DOM helpers. All text goes through text nodes, never innerHTML,
// except Markdown, which markdown.js escapes before producing HTML.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'style' && typeof value === 'object') for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Like Element.replaceChildren, but skips null, undefined and false the way h() does. */
export function replace(el, ...children) {
  clear(el);
  return append(el, ...children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  pass: 'M4 10.5l4 4 8-9',
  fail: 'M5 5l10 10M15 5L5 15',
  warn: 'M10 3l8 14H2zM10 8v4M10 14.5v.5',
  info: 'M10 6v.5M10 9v6',
  memory: 'M4 4h12v12H4zM7 8h6M7 11h6M7 14h3',
};

/** Status icons always travel with a text label (colour is never the only signal). */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (name === 'info') {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '10');
    circle.setAttribute('cy', '10');
    circle.setAttribute('r', '8');
    svg.append(circle);
  }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.info);
  svg.append(path);
  return svg;
}

export function status(kind, text) {
  const map = { good: 'pass', bad: 'fail', warn: 'warn', neutral: 'info' };
  return h('span', { class: `status ${kind}` }, icon(map[kind] || 'info'), text);
}

export function copyBlock(text, label = 'Copy') {
  const button = h('button', { class: 'button secondary small', type: 'button' }, label);
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy';
    }
    setTimeout(() => { button.textContent = label; }, 1800);
  });
  return h('div', { class: 'copy-block' }, h('pre', {}, text), button);
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}

/** Native <dialog> confirmation. Resolves true only when the confirm button is pressed. */
export function confirmDialog({ title, body, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { 'aria-labelledby': 'confirm-title' });
    const cancel = h('button', { class: 'button secondary', type: 'button' }, 'Cancel');
    const ok = h('button', { class: danger ? 'button danger' : 'button', type: 'button' }, confirmLabel);
    append(dialog, [h('h2', { id: 'confirm-title' }, title), ...(Array.isArray(body) ? body : [h('p', {}, body)]), h('div', { class: 'actions' }, cancel, ok)]);
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
