import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type TraceEventType =
  | 'run.started'
  | 'model.step'
  | 'model.wait'
  | 'tool.call'
  | 'tool.result'
  | 'file.read'
  | 'file.search'
  | 'file.write'
  | 'tests.run'
  | 'knowledge.list'
  | 'knowledge.search'
  | 'knowledge.read'
  | 'knowledge.publish'
  | 'run.completed'
  | 'run.failed';

export interface TraceEvent {
  seq: number;
  ts: string;
  elapsedMs: number;
  type: TraceEventType;
  [key: string]: unknown;
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g, // Google standard API keys (being phased out)
  /\bAQ\.[0-9A-Za-z_-]{30,}/g, // Google auth keys (what AI Studio issues now)
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{16,}/g, // OpenAI / OpenRouter
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs (OpenLore tokens)
];

/** Replaces known secret values and secret-shaped strings with [REDACTED]. */
export function createRedactor(secretValues: (string | undefined)[]): (text: string) => string {
  const values = secretValues.filter((v): v is string => typeof v === 'string' && v.length >= 8);
  return (text: string) => {
    let out = text;
    for (const value of values) out = out.split(value).join('[REDACTED]');
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[REDACTED]');
    return out;
  };
}

export function redactValue(value: unknown, redact: (text: string) => string): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, redact));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const sensitiveKey = /^(api[_-]?key|authorization|access[_-]?token|bearer[_-]?token|token|secret|password)$/i.test(k);
      out[k] = sensitiveKey && typeof v === 'string' ? '[REDACTED]' : redactValue(v, redact);
    }
    return out;
  }
  return value;
}

/** Append-only JSONL trace with redaction. Optionally mirrors events to a listener (terminal output). */
export class Tracer {
  private seq = 0;
  private readonly started = Date.now();
  readonly events: TraceEvent[] = [];
  private readonly file: string | undefined;
  private readonly redact: (text: string) => string;
  private readonly listener: ((event: TraceEvent) => void) | undefined;

  constructor(options: { file?: string; secrets?: (string | undefined)[]; listener?: (event: TraceEvent) => void }) {
    this.file = options.file;
    this.redact = createRedactor(options.secrets ?? []);
    this.listener = options.listener;
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, '');
    }
  }

  emit(type: TraceEventType, data: Record<string, unknown> = {}): TraceEvent {
    const event = redactValue(
      { seq: ++this.seq, ts: new Date().toISOString(), elapsedMs: Date.now() - this.started, type, ...data },
      this.redact,
    ) as TraceEvent;
    this.events.push(event);
    if (this.file) appendFileSync(this.file, `${JSON.stringify(event)}\n`);
    this.listener?.(event);
    return event;
  }

  redactText(text: string): string {
    return this.redact(text);
  }

  get elapsedMs(): number {
    return Date.now() - this.started;
  }
}
