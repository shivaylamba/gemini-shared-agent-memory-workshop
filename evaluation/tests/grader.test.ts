import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gradeWorkspace } from '../grading.ts';
import { copySnapshot } from '../snapshot.ts';

/**
 * Validates that the hidden grader discriminates: each deliberately flawed
 * variant of the reference implementation must fail the matching check(s).
 */
const ROOT = join(import.meta.dirname, '..', '..');
const CORE_APP = join(ROOT, 'core-app');
const REFERENCE = join(ROOT, 'solutions', '01-amnesiac-agent', 'reference-implementation');

async function gradeVariant(mutate?: (files: { service: string; routes: string }) => { service: string; routes: string }) {
  const dir = join(mkdtempSync(join(tmpdir(), 'mutant-')), 'app');
  copySnapshot(CORE_APP, dir);
  cpSync(REFERENCE, dir, { recursive: true });
  if (mutate) {
    const servicePath = join(dir, 'src/refunds/refund-service.ts');
    const routesPath = join(dir, 'src/refunds/refund-routes.ts');
    const next = mutate({ service: readFileSync(servicePath, 'utf8'), routes: readFileSync(routesPath, 'utf8') });
    writeFileSync(servicePath, next.service);
    writeFileSync(routesPath, next.routes);
  }
  const grade = await gradeWorkspace({ workspaceDir: dir, pristineDir: CORE_APP, scratchDir: mkdtempSync(join(tmpdir(), 'grade-')) });
  return { grade, failed: grade.checks.filter((c) => !c.passed).map((c) => c.id) };
}

describe('hidden grader', () => {
  it('passes the reference implementation 10/10', async () => {
    const { grade } = await gradeVariant();
    expect(grade.checksPassed).toBe(10);
    expect(grade.regression.failed).toBe(0);
  });

  it('grades correctly when the scratch folder is reached through a symlink (macOS /var -> /private/var)', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'symlinked-')), 'app');
    copySnapshot(CORE_APP, dir);
    cpSync(REFERENCE, dir, { recursive: true });
    const real = mkdtempSync(join(tmpdir(), 'grade-real-'));
    const link = join(mkdtempSync(join(tmpdir(), 'grade-link-')), 'scratch');
    symlinkSync(real, link);
    const grade = await gradeWorkspace({ workspaceDir: dir, pristineDir: CORE_APP, scratchDir: link });
    expect(grade.graderLoadError).toBeUndefined();
    expect(grade.checksPassed).toBe(10);
  });

  it('detects the deprecated legacy adapter', async () => {
    const { failed } = await gradeVariant(({ service, routes }) => ({
      routes,
      service: service
        .replace("import type { TransactionLedger } from '../payments/transaction-ledger.ts';", "import type { TransactionLedger } from '../payments/transaction-ledger.ts';\nimport { LegacyPayGateAdapter } from '../integrations/legacy-paygate-adapter.ts';")
        .replace(/const providerRefund = await withRetry\([\s\S]*?\}\);\n/, "const legacy = new LegacyPayGateAdapter((provider as any).gateway);\n      const r = await legacy.refund(chargeId, input.amount);\n      const providerRefund = { providerRefundId: r.refundId, amount: input.amount };\n"),
    }));
    expect(failed).toContain('current-adapter');
  });

  it('detects missing idempotency', async () => {
    const { failed } = await gradeVariant(({ service, routes }) => ({
      routes,
      service: service.replace('return idempotency.run(scope, input.idempotencyKey, fingerprint, async () => {', 'void idempotency; void scope; void fingerprint;\n    return (async () => {').replace(/\n    \}\);\n  \}\n\}\n?$/, '\n    })();\n  }\n}\n'),
    }));
    expect(failed).toContain('idempotent-retry');
  });

  it('detects accepting non-integer amounts', async () => {
    const { failed } = await gradeVariant(({ service, routes }) => ({ service, routes: routes.replace('parsePositivePaise(body.amount)', 'Number(body.amount)') }));
    expect(failed).toContain('invalid-amount');
  });

  it('detects a missing refundable-amount check', async () => {
    const { failed } = await gradeVariant(({ service, routes }) => ({ routes, service: service.replace('if (input.amount > refundable) {', 'if (false) {') }));
    expect(failed).toEqual(expect.arrayContaining(['excessive-amount', 'cumulative-accounting']));
  });

  it('accepts both readings of ADR-005 for a fully refunded order (409 or 422)', async () => {
    // Stricter status check: only paid / partially_refunded orders are refundable, so a fully
    // refunded order gets ORDER_NOT_REFUNDABLE (409) instead of REFUND_EXCEEDS_REFUNDABLE (422).
    const { grade } = await gradeVariant(({ service, routes }) => ({
      routes,
      service: service.replace("if (order.status === 'pending' || !order.chargeId) {", "if ((order.status !== 'paid' && order.status !== 'partially_refunded') || !order.chargeId) {"),
    }));
    expect(grade.checksPassed).toBe(10);
  });

  it('detects hand-built error bodies', async () => {
    const { failed } = await gradeVariant(({ service, routes }) => ({
      service,
      routes: routes.replace('const body = requireJsonObject(request.body);', "const body = requireJsonObject(request.body);\n    if (typeof body.amount !== 'number' || !Number.isInteger(body.amount)) return { status: 400, body: { message: 'bad amount' } };"),
    }));
    expect(failed).toEqual(expect.arrayContaining(['standardized-errors', 'invalid-amount']));
  });

  it('reports a grader load error when the app does not import', async () => {
    const { grade } = await gradeVariant(({ routes }) => ({ routes, service: 'export class RefundService { constructor( { } }' }));
    expect(grade.checksPassed).toBe(0);
    expect(grade.graderLoadError).toBeTruthy();
  });
});
