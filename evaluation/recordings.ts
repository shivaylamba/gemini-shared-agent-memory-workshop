import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRun, type LoadedRun } from './artifacts.ts';

export const RECORDING_NAMES = ['baseline', 'capture', 'shared-memory', 'stale-memory'] as const;
export type RecordingName = (typeof RECORDING_NAMES)[number];

export interface Provenance {
  recording: RecordingName;
  /** Genuine recordings are false. Test fixtures are true and are refused by replay unless explicitly allowed. */
  synthetic: boolean;
  recordedAt: string;
  recordedBy?: string;
  provider?: string;
  model?: string;
  harnessVersion?: string;
  openloreVersion?: string;
  gitCommit?: string;
  notes?: string;
}

export interface Recording {
  name: RecordingName;
  dir: string;
  provenance: Provenance;
  run: LoadedRun;
}

export function loadRecording(recordingsDir: string, name: RecordingName, options: { allowSynthetic?: boolean } = {}): Recording | undefined {
  const dir = join(recordingsDir, name);
  const provenanceFile = join(dir, 'provenance.json');
  if (!existsSync(provenanceFile)) return undefined;
  const provenance = JSON.parse(readFileSync(provenanceFile, 'utf8')) as Provenance;
  if (provenance.synthetic && !options.allowSynthetic) return undefined;
  const run = loadRun(dir);
  if (!run) return undefined;
  return { name, dir, provenance, run };
}

export function availableRecordings(recordingsDir: string): Recording[] {
  return RECORDING_NAMES.map((name) => loadRecording(recordingsDir, name)).filter((r): r is Recording => Boolean(r));
}

export const RECORDING_FOR_EXERCISE: Record<string, RecordingName> = { '01': 'baseline', '02': 'capture', '03': 'shared-memory' };
