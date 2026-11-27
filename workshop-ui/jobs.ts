import { randomUUID } from 'node:crypto';

/**
 * One background job at a time (a harness run or a replay). Events are buffered
 * so a browser that connects late, or reconnects, sees the whole stream.
 */
export type JobStatus = 'running' | 'succeeded' | 'failed';

export interface JobEvent {
  kind: 'trace' | 'done' | 'error';
  data: unknown;
}

export interface Job {
  id: string;
  kind: 'harness' | 'replay';
  exercise: string;
  label?: string;
  status: JobStatus;
  startedAt: string;
  runId?: string;
  error?: { message: string; hint?: string };
  events: JobEvent[];
  listeners: Set<(event: JobEvent) => void>;
}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private current: Job | undefined;

  get active(): Job | undefined {
    return this.current?.status === 'running' ? this.current : undefined;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  latest(): Job | undefined {
    return this.current;
  }

  start(kind: Job['kind'], exercise: string, label: string | undefined, execute: (emit: (event: unknown) => void) => Promise<{ runId: string }>): Job {
    if (this.active) throw new Error('A run is already in progress. Wait for it to finish.');
    const job: Job = { id: randomUUID(), kind, exercise, ...(label ? { label } : {}), status: 'running', startedAt: new Date().toISOString(), events: [], listeners: new Set() };
    this.jobs.set(job.id, job);
    this.current = job;
    const push = (event: JobEvent) => {
      job.events.push(event);
      for (const listener of job.listeners) listener(event);
    };
    execute((data) => push({ kind: 'trace', data }))
      .then(({ runId }) => {
        job.status = 'succeeded';
        job.runId = runId;
        push({ kind: 'done', data: { runId } });
      })
      .catch((error: Error & { hint?: string }) => {
        job.status = 'failed';
        job.error = { message: error.message, ...(error.hint ? { hint: error.hint } : {}) };
        push({ kind: 'error', data: job.error });
      });
    return job;
  }

  summary(job: Job) {
    return { id: job.id, kind: job.kind, exercise: job.exercise, label: job.label, status: job.status, startedAt: job.startedAt, runId: job.runId, error: job.error, eventCount: job.events.length };
  }
}
