import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_DIR } from '../assets.ts';
import { assertNoCredentials, buildStaticReplay, bundleModules, scriptSafeJson, StaticBuildError } from '../build-static.ts';
import { syntheticRecordings } from './fixtures.ts';

describe('static replay build', () => {
  let fixture: Awaited<ReturnType<typeof syntheticRecordings>>;
  let html: string;

  beforeAll(async () => {
    fixture = await syntheticRecordings();
    const result = buildStaticReplay({ recordingsDir: fixture.recordingsDir, allowSynthetic: true, outFile: join(fixture.base, 'replay.html'), secrets: [] });
    expect(result.synthetic).toBe(true);
    expect(result.recordings).toEqual(['baseline', 'shared-memory']);
    html = readFileSync(result.outFile, 'utf8');
  }, 120_000);

  it('refuses synthetic recordings unless they are explicitly allowed', () => {
    expect(() => buildStaticReplay({ recordingsDir: fixture.recordingsDir, outFile: join(fixture.base, 'refused.html'), secrets: [] })).toThrow(StaticBuildError);
    expect(() => buildStaticReplay({ recordingsDir: join(fixture.base, 'nothing-here'), outFile: join(fixture.base, 'empty.html'), secrets: [] })).toThrow(/No recordings were found/);
  });

  it('labels a page built from synthetic recordings on every view', () => {
    expect(html).toContain('class="synthetic-banner"');
    expect(html).toContain('not real model output');
  });

  it('is self-contained: no server token, no external resources, nothing left to fetch', () => {
    expect(html).not.toMatch(/<meta name="dashboard-token"/);
    expect(html).not.toContain('{{');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).not.toMatch(/url\('\/fonts\//);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('window.__WORKSHOP_DATA__');
  });

  it('allows exactly its own inline scripts and styles through the CSP', () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!;
    const hash = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
    const scripts = [...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts).toHaveLength(2);
    for (const script of scripts) expect(csp).toContain(hash(script));
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    expect(csp).toContain(hash(style));
    expect(csp).not.toContain('unsafe-inline');
  });

  it('keeps recorded text inert: it cannot end the data script early', () => {
    // The scripted final message contains "</script><script>alert(1)</script>".
    const dataScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]![1]!;
    expect(dataScript).toContain('\\u003c/script\\u003e');
    const sandbox: { window: { __WORKSHOP_DATA__?: { runs: { finalResponse: string; recording?: string }[] } } } = { window: {} };
    new Script(dataScript).runInNewContext(sandbox);
    const data = sandbox.window.__WORKSHOP_DATA__!;
    expect(data.runs.find((r) => r.recording === 'baseline')!.finalResponse).toContain('</script><script>alert(1)</script>');
  });

  it('embeds the evaluation, the recorded knowledge and the provenance of each recording', () => {
    const dataScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]![1]!;
    const sandbox: { window: Record<string, any> } = { window: {} };
    new Script(dataScript).runInNewContext(sandbox);
    const data = sandbox.window.__WORKSHOP_DATA__;
    expect(data.status.mode).toBe('static');
    expect(data.status.provider.credentialSet).toBe(false);
    expect(data.status.recordings.every((r: { synthetic: boolean }) => r.synthetic)).toBe(true);
    expect(data.evaluation.report.baseline.runId).toBe(fixture.baseline.runId);
    expect(data.knowledge.approved.map((d: { path: string }) => d.path)).toEqual(['/knowledge/runbooks/refund-workflow.md']);
    expect(data.knowledge.approved[0].proposedBy).toBe('antigravity-capture');
    expect(data.runs.every((r: { provenance?: { synthetic: boolean } }) => r.provenance?.synthetic === true)).toBe(true);
    expect(JSON.stringify(data)).not.toContain(homedir() === '/' ? '\u0000' : homedir());
  });

  it('bundles the browser modules into one script without imports or exports', () => {
    const bundle = bundleModules(join(PUBLIC_DIR, 'js', 'app.js'));
    expect(bundle).not.toMatch(/^\s*(import|export)\b/m);
    expect(() => new Script(bundle)).not.toThrow();
    // Dependencies are evaluated before the modules that use them.
    expect(bundle.indexOf('__modules["js/dom.js"] =')).toBeLessThan(bundle.indexOf('__modules["js/views/run.js"] ='));
    expect(bundle.indexOf('__modules["js/views/run.js"] =')).toBeLessThan(bundle.indexOf('__modules["js/app.js"] ='));
  });

  it('refuses to write a page that contains a credential', () => {
    expect(() => assertNoCredentials('<p>my-configured-secret-value</p>', ['my-configured-secret-value'])).toThrow(StaticBuildError);
    expect(() => assertNoCredentials(`<p>${'AIza'}${'x'.repeat(35)}</p>`, [])).toThrow(/Google API key/);
    expect(() => assertNoCredentials(`<p>AQ.${'Ab'}${'y'.repeat(40)}</p>`, [])).toThrow(/Google auth key/);
    expect(() => assertNoCredentials(`<p>sk-ant-${'a'.repeat(40)}</p>`, [])).toThrow(StaticBuildError);
    expect(() => assertNoCredentials('<p>Bearer abcdefghijklmnopqrstuvwxyz0123456789</p>', [])).toThrow(/bearer token/);
    expect(() => assertNoCredentials('<p>nothing to see</p>', ['short'])).not.toThrow();
  });

  it('escapes JSON for inline scripts', () => {
    const value = { text: '</script><!-- & \u2028 \u2029 >' };
    const out = scriptSafeJson(value);
    expect(out).not.toMatch(/<\/script|<!--|[\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });
});
