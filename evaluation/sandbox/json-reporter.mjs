// node:test reporter that emits one JSON object per finished test (NDJSON).
// Loaded by the sandboxed test process via --test-reporter.
export default async function* jsonReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data ?? {};
    if (data.details?.type === 'suite') continue;
    const error = data.details?.error;
    const cause = error?.cause ?? error;
    yield `${JSON.stringify({
      name: data.name,
      file: data.file,
      nesting: data.nesting,
      status: event.type === 'test:pass' ? 'passed' : 'failed',
      skipped: Boolean(data.skip),
      durationMs: Math.round(data.details?.duration_ms ?? 0),
      error: event.type === 'test:fail' ? String(cause?.message ?? error?.message ?? 'failed').slice(0, 2000) : undefined,
    })}\n`;
  }
}
