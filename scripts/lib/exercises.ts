import type { ExerciseId } from './paths.ts';

export interface ExerciseInfo {
  id: ExerciseId;
  title: string;
  minutes: number;
  objective: string;
  condition?: 'baseline' | 'capture' | 'shared-memory';
  startingState: string;
  openlore: 'none' | 'publish' | 'read';
}

export const EXERCISES: Record<ExerciseId, ExerciseInfo> = {
  '01': {
    id: '01',
    title: 'The Amnesiac Agent',
    minutes: 12,
    objective: 'Experience a fresh agent session with no durable shared knowledge.',
    condition: 'baseline',
    startingState: 'A fresh copy of ShopFlow with refunds unimplemented and the original docs. No shared knowledge is available.',
    openlore: 'none',
  },
  '02': {
    id: '02',
    title: 'Teach an Agent to Remember',
    minutes: 15,
    objective: 'Turn an investigation into durable, reviewed knowledge instead of conversation history.',
    condition: 'capture',
    startingState: 'A fresh copy of ShopFlow. OpenLore is running; the agent can only send notes to the review inbox (/proposals/inbox).',
    openlore: 'publish',
  },
  '03': {
    id: '03',
    title: 'Share Knowledge Across Agents',
    minutes: 15,
    objective: 'Prove that reviewed knowledge survives the end of a conversation and reaches a new session.',
    condition: 'shared-memory',
    startingState: 'A new copy of ShopFlow, identical to Exercise 01 (same snapshot hash); a new session; read-only access to /knowledge.',
    openlore: 'read',
  },
  '04': {
    id: '04',
    title: 'Does Memory Actually Help?',
    minutes: 15,
    objective: 'Measure correctness, context and exploration instead of assuming an improvement.',
    startingState: 'Your run artifacts in runs/ (or genuine recordings in replay mode).',
    openlore: 'none',
  },
};
