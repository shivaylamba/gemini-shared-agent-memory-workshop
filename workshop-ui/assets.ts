import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../scripts/lib/paths.ts';

/** Where the dashboard's browser files live. Shared by the live server and the static replay build. */
export const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

/** Self-hosted fonts (no font CDN): the stylesheet refers to them as /fonts/<name>. */
export const FONT_FILES: Record<string, string> = {
  'hyperlegible-next.woff2': join(ROOT, 'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2'),
  'hyperlegible-mono-400.woff2': join(ROOT, 'node_modules/@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-400-normal.woff2'),
  'hyperlegible-mono-700.woff2': join(ROOT, 'node_modules/@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-700-normal.woff2'),
};
