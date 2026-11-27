import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CATEGORIES, parseNote, validateNote } from '../agent-harness/src/knowledge-format.ts';
import { allCredentialEnvNames } from '../agent-harness/src/providers/index.ts';
import { listRuns, type LoadedRun } from '../evaluation/artifacts.ts';
import { loadRecording, RECORDING_NAMES, type Recording } from '../evaluation/recordings.ts';
import { loadDotEnv } from '../scripts/lib/env.ts';
import { LOCK } from '../scripts/lib/openlore.ts';
import { CORE_APP, RECORDINGS_DIR, ROOT, RUNS_DIR } from '../scripts/lib/paths.ts';
import { FONT_FILES, PUBLIC_DIR } from './assets.ts';
import { evaluationView, exerciseViews, portabilityView, runDetail, runListItem, type StatusView } from './data.ts';

/**
 * Static browser replay: one self-contained HTML file that opens from disk
 * (file://) with no server, no network access and no credentials. It shows the
 * same views as the live dashboard, filled from genuine recordings, and plays
 * their recorded events back in the browser. No model is called.
 *
 * Synthetic recordings (test fixtures) are refused unless --allow-synthetic is
 * passed, in which case the page carries a permanent banner saying so.
 */

export const DEFAULT_OUT = join(ROOT, 'workshop-ui', 'dist', 'workshop-replay.html');

export class StaticBuildError extends Error {}

export interface StaticBuildOptions {
  recordingsDir?: string;
  /** Also include every run in this directory (for example your own runs/). */
  runsDir?: string;
  allowSynthetic?: boolean;
  outFile?: string;
  now?: Date;
  /** Values that must never appear in the page. Defaults to every provider credential in the environment. */
  secrets?: (string | undefined)[];
}

export interface StaticBuildResult {
  outFile: string;
  bytes: number;
  recordings: string[];
  includedRuns: number;
  synthetic: boolean;
}

interface StaticRun extends NonNullable<ReturnType<typeof runDetail>> {
  recording?: string;
  provenance?: Recording['provenance'];
}

// ---------------------------------------------------------------- bundling

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$/gm;

/**
 * Turns the dashboard's ES modules into one classic-free module script. Each
 * module keeps its own scope (wrapped in a function) so top-level names never
 * collide; imports become destructuring from already-evaluated modules.
 * Only the import/export forms the dashboard uses are supported, and anything
 * else fails the build rather than producing a broken page.
 */
export function bundleModules(entryFile: string): string {
  const order: string[] = [];
  const sources = new Map<string, string>();
  const visit = (file: string, stack: string[]) => {
    if (order.includes(file)) return;
    if (stack.includes(file)) throw new StaticBuildError(`Circular import: ${[...stack, file].join(' -> ')}`);
    const source = readFileSync(file, 'utf8');
    sources.set(file, source);
    for (const match of source.matchAll(IMPORT_RE)) visit(resolve(dirname(file), match[2]!), [...stack, file]);
    order.push(file);
  };
  visit(entryFile, []);

  const id = (file: string) => relative(PUBLIC_DIR, file).split(sep).join('/');
  const chunks = order.map((file) => {
    const exportsOf: string[] = [];
    let body = sources.get(file)!.replace(IMPORT_RE, (_all, names: string, from: string) => {
      const target = id(resolve(dirname(file), from));
      const bindings = names.split(',').map((n) => n.trim()).filter(Boolean);
      if (bindings.some((b) => /\s/.test(b))) throw new StaticBuildError(`${id(file)}: renamed imports are not supported by the static build`);
      return `const { ${bindings.join(', ')} } = __modules[${JSON.stringify(target)}];`;
    });
    body = body.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_all, kind: string, name: string) => {
      exportsOf.push(name);
      return `${kind} ${name}`;
    });
    body = body.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_all, names: string) => {
      exportsOf.push(...names.split(',').map((n) => n.trim()).filter(Boolean));
      return '';
    });
    if (/^\s*(import|export)\b/m.test(body)) throw new StaticBuildError(`${id(file)}: unsupported import or export form for the static build`);
    return `// ${id(file)}\n__modules[${JSON.stringify(id(file))}] = (() => {\n${body}\nreturn { ${exportsOf.join(', ')} };\n})();`;
  });
  return `const __modules = {};\n${chunks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------- data

function frontmatterString(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key];
  return typeof value === 'string' && value ? value : undefined;
}

function walkMarkdown(root: string, prefix: string): { path: string; content: string }[] {
  if (!existsSync(root)) return [];
  const out: { path: string; content: string }[] = [];
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walkMarkdown(full, `${prefix}/${entry}`));
    else if (entry.endsWith('.md')) out.push({ path: `${prefix}/${entry}`, content: readFileSync(full, 'utf8') });
  }
  return out;
}

/** Knowledge recorded with the runs: notes they read (approved) and notes they proposed. */
function knowledgeFromRecordedRuns(runs: { run: LoadedRun; producer: string }[]) {
  const approved = new Map<string, Record<string, unknown>>();
  const proposals = new Map<string, Record<string, unknown>>();
  const documents: Record<string, string> = {};
  for (const { run, producer } of runs) {
    for (const doc of walkMarkdown(join(run.dir, 'knowledge', 'knowledge'), '/knowledge')) {
      const fm = parseNote(doc.content)?.frontmatter ?? {};
      const rel = doc.path.slice('/knowledge/'.length);
      documents[doc.path] = doc.content;
      approved.set(doc.path, {
        path: doc.path,
        category: rel.includes('/') ? rel.split('/')[0] : 'general',
        title: frontmatterString(fm, 'title'),
        status: frontmatterString(fm, 'status'),
        verifiedAt: frontmatterString(fm, 'verified_at')?.slice(0, 10),
        proposedBy: frontmatterString(fm, 'proposed_by'),
        contributedBy: frontmatterString(fm, 'contributed_by'),
        reviewedBy: frontmatterString(fm, 'reviewed_by'),
      });
    }
    for (const doc of walkMarkdown(join(run.dir, 'knowledge', 'proposals'), '/proposals')) {
      const fm = parseNote(doc.content)?.frontmatter ?? {};
      const raw = frontmatterString(fm, 'category') ?? 'decisions';
      const category = (CATEGORIES as readonly string[]).includes(raw) ? raw : 'decisions';
      const slug = basename(doc.path, '.md');
      const target = `/knowledge/${category}/${slug}.md`;
      documents[doc.path] = doc.content;
      proposals.set(doc.path, {
        slug,
        path: doc.path,
        content: doc.content,
        issues: validateNote(doc.content, { appRoot: CORE_APP }),
        proposedBy: producer,
        category,
        target,
        targetExists: false,
      });
    }
  }
  for (const proposal of proposals.values()) proposal.targetExists = approved.has(String(proposal.target));
  const sortByPath = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.path).localeCompare(String(b.path));
  return { approved: [...approved.values()].sort(sortByPath), proposals: [...proposals.values()].sort(sortByPath), documents };
}

export interface StaticData {
  status: StatusView;
  runList: (ReturnType<typeof runListItem> & { recording?: string })[];
  runs: StaticRun[];
  evaluation: ReturnType<typeof evaluationView>;
  portability: ReturnType<typeof portabilityView>;
  knowledge: ReturnType<typeof knowledgeFromRecordedRuns>;
}

export function collectStaticData(options: StaticBuildOptions = {}): { data: StaticData; recordings: Recording[]; refusedSynthetic: string[] } {
  const recordingsDir = options.recordingsDir ?? RECORDINGS_DIR;
  const recordings: Recording[] = [];
  const refusedSynthetic: string[] = [];
  for (const name of RECORDING_NAMES) {
    const recording = loadRecording(recordingsDir, name, { allowSynthetic: options.allowSynthetic });
    if (recording) recordings.push(recording);
    else if (loadRecording(recordingsDir, name, { allowSynthetic: true })) refusedSynthetic.push(name);
  }
  const included = options.runsDir ? listRuns(options.runsDir) : [];
  if (recordings.length === 0 && included.length === 0) {
    const why = refusedSynthetic.length
      ? `Only synthetic test recordings were found (${refusedSynthetic.join(', ')}). They are not model output and are left out unless you pass --allow-synthetic.`
      : `No recordings were found in ${recordingsDir}.`;
    throw new StaticBuildError(`${why} Record genuine runs with npm run record, or pass --include-runs to build the page from your own runs in runs/.`);
  }

  const runs: StaticRun[] = [
    ...recordings.map((r) => ({ ...runDetail(r.dir)!, recording: r.name, provenance: r.provenance })),
    ...included.map((run) => runDetail(run.dir)!).filter(Boolean),
  ];
  const loaded: LoadedRun[] = [...recordings.map((r) => r.run), ...included];
  const listItems = [
    ...recordings.map((r) => ({ ...runListItem(r.run), recording: r.name })),
    ...included.map(runListItem),
  ].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const status: StatusView = {
    mode: 'static',
    generatedAt: (options.now ?? new Date()).toISOString(),
    workshop: { path: 'replay' },
    provider: { id: 'none', label: 'No model', modelId: null, credentialSet: false, credentialEnv: [], problems: ['This page cannot call a model.'] },
    openlore: { installed: false, pinned: LOCK.version, running: false, endpoint: '' },
    recordings: recordings.map((r) => ({ name: r.name, provider: r.provenance.provider, model: r.provenance.model, recordedAt: r.provenance.recordedAt, synthetic: Boolean(r.provenance.synthetic) })),
    exercises: exerciseViews(),
  };

  const data: StaticData = {
    status,
    runList: listItems,
    runs,
    evaluation: evaluationView(loaded, {}),
    portability: portabilityView(loaded),
    knowledge: knowledgeFromRecordedRuns(loaded.map((run) => ({ run, producer: run.metadata.openlore.identity ?? run.metadata.agent.name }))),
  };
  return { data, recordings, refusedSynthetic };
}

// ---------------------------------------------------------------- page

/** JSON that is safe inside a <script> element: no "</script>", no HTML comments, no line separators. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function inlineStyles(): string {
  let css = readFileSync(join(PUBLIC_DIR, 'styles.css'), 'utf8');
  css = css.replace(/url\('\/fonts\/([a-z0-9-]+\.woff2)'\)/g, (all, name: string) => {
    const file = FONT_FILES[name];
    if (!file || !existsSync(file)) return all; // falls back to the system font stack
    return `url('data:font/woff2;base64,${readFileSync(file).toString('base64')}')`;
  });
  return css;
}

export function renderStaticPage(data: StaticData, options: { synthetic: boolean }): string {
  const template = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  const css = inlineStyles();
  const dataScript = `window.__WORKSHOP_DATA__ = ${scriptSafeJson(data)};`;
  const appScript = bundleModules(join(PUBLIC_DIR, 'js', 'app.js'));
  if (/<\/script|<!--/i.test(appScript) || /<\/style/i.test(css)) throw new StaticBuildError('The dashboard code contains text that would end an inline script or style early.');
  // The page may not fetch anything: every byte it needs is inline.
  const csp = [
    "default-src 'none'",
    `script-src ${sha256(dataScript)} ${sha256(appScript)}`,
    `style-src ${sha256(css)}`,
    'font-src data:',
    'img-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const banner = options.synthetic
    ? `<p class="synthetic-banner" role="note">This page contains synthetic test recordings. They are fixtures, not real model output.</p>`
    : '';

  let html = template
    .replace(/\s*<meta name="dashboard-token"[^>]*>/, '')
    .replace(/\s*<meta name="data-mode"[^>]*>/, '')
    .replace(/<title>[^<]*<\/title>/, '<title>Shared agent memory workshop, recorded runs</title>')
    .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
    .replace(/\s*<script type="module" src="[^"]*"><\/script>/, '')
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
    .replace('</head>', `  <style>${css}</style>\n</head>`)
    .replace('<main id="main" tabindex="-1"></main>', `${banner}<main id="main" tabindex="-1"></main>`)
    .replace('</body>', `<script>${dataScript}</script>\n<script type="module">${appScript}</script>\n</body>`);
  if (html.includes('{{')) throw new StaticBuildError('The page template still contains an unreplaced placeholder.');
  html = html.replace(/<p class="mode-badge">[\s\S]*?<\/p>/, '<p class="mode-badge static"><span class="dot" aria-hidden="true"></span><span>Replay page, read-only</span></p>');
  return html;
}

// ---------------------------------------------------------------- build

const CREDENTIAL_SHAPES: [string, RegExp][] = [
  ['a Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['a Google auth key', /\bAQ\.[0-9A-Za-z_-]{30,}/],
  ['an OpenAI-style secret key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/],
  ['an OpenRouter key', /\bsk-or-v1-[A-Za-z0-9]{20,}/],
  ['a bearer token', /Bearer\s+[A-Za-z0-9._~+/-]{24,}/],
];

/** Refuses to write a page that contains a configured secret or anything shaped like a credential. */
export function assertNoCredentials(html: string, secrets: (string | undefined)[]): void {
  for (const secret of secrets) {
    if (secret && secret.length >= 8 && html.includes(secret)) throw new StaticBuildError('A configured credential value appears in the recorded data. The page was not written.');
  }
  for (const [what, pattern] of CREDENTIAL_SHAPES) {
    if (pattern.test(html)) throw new StaticBuildError(`Something that looks like ${what} appears in the recorded data. The page was not written; check the recordings and runs you included.`);
  }
}

/** Replaces this machine's home directory with ~ so the page does not carry local account paths. */
function scrubHome<T>(data: T): T {
  const home = homedir();
  if (!home || home === '/') return data;
  return JSON.parse(JSON.stringify(data).split(JSON.stringify(home).slice(1, -1)).join('~')) as T;
}

export function buildStaticReplay(options: StaticBuildOptions = {}): StaticBuildResult {
  const { data, recordings } = collectStaticData(options);
  const synthetic = recordings.some((r) => r.provenance.synthetic);
  const html = renderStaticPage(scrubHome(data), { synthetic });
  const secrets = options.secrets ?? allCredentialEnvNames().map((name) => process.env[name]);
  assertNoCredentials(html, secrets);
  const outFile = options.outFile ?? DEFAULT_OUT;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
  return { outFile, bytes: Buffer.byteLength(html), recordings: recordings.map((r) => r.name), includedRuns: data.runs.length - recordings.length, synthetic };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      'include-runs': { type: 'boolean', default: false },
      'allow-synthetic': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run ui:static [-- --out <file>] [--include-runs] [--allow-synthetic]

Builds one HTML file that replays the recordings in recordings/ in any browser,
offline, with no server and no model. Default output: ${posix.normalize(relative(ROOT, DEFAULT_OUT).split(sep).join('/'))}

  --include-runs     also include your own runs from runs/
  --allow-synthetic  include synthetic test fixtures (the page says so on every view)`);
    process.exit(0);
  }
  loadDotEnv();
  try {
    const result = buildStaticReplay({
      outFile: values.out ? resolve(values.out) : undefined,
      runsDir: values['include-runs'] ? RUNS_DIR : undefined,
      allowSynthetic: values['allow-synthetic'],
    });
    const parts = [result.recordings.length ? `recordings: ${result.recordings.join(', ')}` : 'no recordings', result.includedRuns ? `${result.includedRuns} of your runs` : ''].filter(Boolean);
    const shown = relative(process.cwd(), result.outFile);
    console.log(`Wrote ${shown && !shown.startsWith('..') ? shown : result.outFile} (${Math.round(result.bytes / 1024)} KB; ${parts.join('; ')}).`);
    if (result.synthetic) console.log('Warning: the page includes synthetic test recordings and says so on every view.');
    console.log('Open it in any browser. It works offline and cannot call a model or change anything.');
  } catch (error) {
    if (error instanceof StaticBuildError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
