import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_DIR } from '../assets.ts';

// The browser modules are plain JavaScript; these functions do not touch the DOM.
type Markdown = { markdownToHtml(md: string): string; splitFrontmatter(md: string): { frontmatter: Record<string, unknown>; body: string }; escapeHtml(text: string): string };
type Charts = { barWidths(values: (number | null)[]): (number | null)[] };
type Format = { formatMetric(value: number | null, unit?: string): string; delta(a: number | null, b: number | null, unit?: string): unknown; originLabel(run: Record<string, unknown>): string };

let markdown: Markdown;
let charts: Charts;
let format: Format;

beforeAll(async () => {
  const load = (file: string) => import(pathToFileURL(join(PUBLIC_DIR, 'js', file)).href);
  markdown = (await load('markdown.js')) as Markdown;
  charts = (await load('charts.js')) as Charts;
  format = (await load('format.js')) as Format;
});

describe('knowledge note rendering', () => {
  it('never renders raw HTML from a note', () => {
    const html = markdown.markdownToHtml('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n- <b>bold</b>');
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops dangerous link targets and keeps safe ones', () => {
    for (const target of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x', 'vbscript:msgbox(1)']) {
      const html = markdown.markdownToHtml(`[click](${target})`);
      expect(html, target).not.toContain('href=');
      expect(html).toContain('click');
    }
    expect(markdown.markdownToHtml('[docs](https://example.com/a?b=1&c=2)')).toContain('href="https://example.com/a?b=1&amp;c=2"');
  });

  it('cannot break out of an attribute', () => {
    const html = markdown.markdownToHtml('[x](https://a.example/" onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s+onmouseover=/);
  });

  it('keeps code spans and indented list continuations', () => {
    const html = markdown.markdownToHtml('- Use `IdempotencyStore.run` with a\n  per-operation scope.\n- Second');
    expect(html).toBe('<ul><li>Use <code>IdempotencyStore.run</code> with a per-operation scope.</li><li>Second</li></ul>');
  });

  it('splits frontmatter, including lists', () => {
    const { frontmatter, body } = markdown.splitFrontmatter('---\ntitle: A\nsource:\n  - x.ts\n  - y.md\n---\n# Body');
    expect(frontmatter).toEqual({ title: 'A', source: ['x.ts', 'y.md'] });
    expect(body).toBe('# Body');
  });
});

describe('comparison bars', () => {
  it('scales each row to its own maximum and keeps unavailable values unavailable', () => {
    expect(charts.barWidths([10, 5])).toEqual([100, 50]);
    expect(charts.barWidths([0, 0])).toEqual([0, 0]);
    expect(charts.barWidths([null, 4])).toEqual([null, 100]);
    expect(charts.barWidths([null, null])).toEqual([null, null]);
  });

  it('labels missing values as unavailable instead of zero', () => {
    expect(format.formatMetric(null)).toBe('unavailable');
  });

  it('labels where a run came from', () => {
    expect(format.originLabel({ origin: 'live', interface: 'harness' })).toBe('Live');
    expect(format.originLabel({ origin: 'replay', replayOf: 'baseline' })).toBe('Replay of the baseline recording');
    expect(format.originLabel({ origin: 'live', interface: 'external' })).toBe('External agent');
    expect(format.originLabel({ origin: 'live', recording: 'baseline' })).toBe('Recording');
  });
});
