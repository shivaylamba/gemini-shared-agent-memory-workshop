import { describe, expect, it } from 'vitest';
import { createRedactor, Tracer } from '../src/tracing.ts';

describe('redaction', () => {
  it('removes configured secrets and secret-shaped strings', () => {
    const redact = createRedactor(['my-very-secret-value']);
    const text = 'key=my-very-secret-value auth=Bearer abcdefghijklmnop google=AIzaSyA1234567890123456789012 googleauth=AQ.Ab1ExampleOnlyNotARealKey_0123456789abcdef openai=sk-proj-abcdefghijklmnopqrstu anthropic=sk-ant-abcdefghijklmnopqrstu';
    const out = redact(text);
    expect(out).not.toContain('my-very-secret-value');
    expect(out).not.toContain('abcdefghijklmnop');
    expect(out).not.toContain('AIzaSy');
    expect(out).not.toContain('AQ.Ab1');
    expect(out).not.toMatch(/sk-(proj|ant)-/);
  });

  it('redacts sensitive keys but keeps token counts', () => {
    const tracer = new Tracer({ secrets: ['super-secret-token-value'] });
    const event = tracer.emit('model.step', { usage: { inputTokens: 120 }, headers: { authorization: 'x' }, note: 'super-secret-token-value', token: 'abc' });
    expect((event.usage as { inputTokens: number }).inputTokens).toBe(120);
    expect(event.token).toBe('[REDACTED]');
    expect(event.note).toBe('[REDACTED]');
  });
});
