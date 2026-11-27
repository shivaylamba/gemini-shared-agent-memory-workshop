import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads OpenLore's analytics event log (observed format in v0.8.0:
 * <data_dir>/<analytics.dir>/events/events-YYYY-MM-DD.jsonl with records such as
 * { type: "doc.read", principal, time, fields: { path, bytes } }).
 * This is server-side evidence of what an identity retrieved, which lets the
 * workshop measure knowledge retrieval for external agents it cannot trace.
 * It is not a documented OpenLore API, so callers must treat a missing log as "unavailable".
 */

export interface LoreActivity {
  available: boolean;
  reason?: string;
  reads: { path: string; bytes: number; time: string }[];
  hits: { path: string; bytes: number; time: string }[];
  searches: { pattern: string; time: string }[];
  writes: { path: string; action: string; time: string }[];
}

interface RawEvent {
  type?: string;
  principal?: string;
  time?: string;
  fields?: Record<string, unknown>;
}

export function readLoreActivity(analyticsDir: string, principal: string, since: Date, until = new Date()): LoreActivity {
  const activity: LoreActivity = { available: false, reads: [], hits: [], searches: [], writes: [] };
  const eventsDir = join(analyticsDir, 'events');
  if (!existsSync(eventsDir)) return { ...activity, reason: `no OpenLore analytics log at ${eventsDir}` };
  activity.available = true;
  for (const file of readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(eventsDir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let event: RawEvent;
      try {
        event = JSON.parse(line) as RawEvent;
      } catch {
        continue;
      }
      if (event.principal !== principal || !event.time) continue;
      const time = new Date(event.time);
      if (time < since || time > until) continue;
      const fields = event.fields ?? {};
      if (event.type === 'doc.read') activity.reads.push({ path: String(fields.path), bytes: Number(fields.bytes) || 0, time: event.time });
      else if (event.type === 'doc.hit') activity.hits.push({ path: String(fields.path), bytes: Number(fields.bytes) || 0, time: event.time });
      else if (event.type === 'search.query') activity.searches.push({ pattern: String(fields.pattern ?? ''), time: event.time });
      else if (event.type === 'doc.scalars' || event.type === 'doc.write') activity.writes.push({ path: String(fields.path ?? ''), action: String(fields.action ?? event.type), time: event.time });
    }
  }
  return activity;
}
