// Everything the glasses keep: the pairing code, received sheets, what's been cut and fused,
// take-outs set on the glasses, and setting overrides. Saved in this app's local storage.
import {useSyncExternalStore} from 'react';
import type {Job, Progress} from '../core/job.ts';
import type {Settings, TakeoutEntry} from '../core/library.ts';
import {newPairCode} from '../core/pair.ts';
import {solve, type Solution} from '../core/solve.ts';

export interface State {
  code: string;
  jobs: Job[]; // newest first
  progress: Record<string, Progress>;
  library: TakeoutEntry[]; // take-outs set on the glasses (win over the phone's)
  overrides: Partial<Pick<Settings, 'fusionAllowance' | 'stickLength'>>;
  seen: string[]; // job ids already received (so a re-send isn't added twice)
}

const KEY = 'kmr.fitup.v1';
const listeners = new Set<() => void>();
let state: State = load();
save(); // keep a newly made pairing code

function load(): State {
  let s: Partial<State> = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    /* fresh start */
  }
  return {
    code: typeof s.code === 'string' && s.code.length === 8 ? s.code : newPairCode(),
    jobs: Array.isArray(s.jobs) ? s.jobs : [],
    progress: s.progress && typeof s.progress === 'object' ? s.progress : {},
    library: Array.isArray(s.library) ? s.library : [],
    overrides: s.overrides && typeof s.overrides === 'object' ? s.overrides : {},
    seen: Array.isArray(s.seen) ? s.seen.slice(-200) : [],
  };
}

function save() {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return;
    } catch {
      // Out of room: drop drawing photos from the oldest sheets first.
      const withThumb = [...state.jobs].reverse().find(j => j.thumb || j.thumbs?.length);
      if (!withThumb) return;
      state = {...state, jobs: state.jobs.map(j => (j === withThumb ? {...j, thumb: null, thumbs: []} : j))};
    }
  }
}

function set(next: Partial<State>) {
  state = {...state, ...next};
  save();
  solved.clear();
  for (const l of listeners) l();
}

export const getState = () => state;
export function useStore(): State {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Add received sheets (skipping any already received). `again` allows re-adding (samples). */
export function addJobs(jobs: Job[], again = false): Job[] {
  const fresh = jobs.filter(j => (again || !state.seen.includes(j.id)) && !state.jobs.some(x => x.id === j.id));
  if (!fresh.length) return [];
  set({jobs: [...fresh.sort((a, b) => b.created - a.created), ...state.jobs], seen: [...state.seen, ...fresh.map(j => j.id)].slice(-200)});
  return fresh;
}

export function removeJob(id: string) {
  const progress = {...state.progress};
  delete progress[id];
  set({jobs: state.jobs.filter(j => j.id !== id), progress});
}

export const newCode = () => set({code: newPairCode()});

export function progressOf(id: string): Progress {
  return state.progress[id] ?? {cut: [], fused: []};
}

export function toggle(jobId: string, what: 'cut' | 'fused', key: string) {
  const p = progressOf(jobId);
  const list = p[what].includes(key) ? p[what].filter(x => x !== key) : [...p[what], key];
  set({progress: {...state.progress, [jobId]: {...p, [what]: list}}});
}

export type TakeoutField = 'takeout' | 'branch' | 'outlet' | 'laying';

/** Save one value for a fitting (run take-out, branch take-out or in-line length). */
export function setTakeout(type: TakeoutEntry['type'], size: number, material: TakeoutEntry['material'], field: TakeoutField, value: number, fallback?: TakeoutEntry | null, size2?: number | null) {
  const same = (e: TakeoutEntry) => e.type === type && e.size === size && e.material === material && (e.size2 ?? null) === (size2 ?? null);
  const prev = state.library.find(same) ?? (fallback ? {...fallback} : null);
  const entry: TakeoutEntry = {
    id: `g-${type}-${size}${size2 ? `x${size2}` : ''}-${material}`,
    type,
    size,
    size2: size2 ?? null,
    material,
    takeout: prev?.takeout ?? null,
    branch: prev?.branch ?? null,
    outlet: prev?.outlet ?? null,
    laying: prev?.laying ?? null,
    note: 'Set on the glasses',
  };
  entry[field] = value;
  set({library: [entry, ...state.library.filter(e => !same(e))]});
}

export const clearLibrary = () => set({library: []});
export const setOverride = (o: State['overrides']) => set({overrides: {...state.overrides, ...o}});

export function settingsFor(job: Job): Settings {
  return {...job.settings, ...state.overrides};
}

export function libraryFor(job: Job): TakeoutEntry[] {
  return [...state.library, ...job.library];
}

const solved = new Map<string, Solution>();
export function solveJob(job: Job): Solution {
  let s = solved.get(job.id);
  if (!s) {
    s = solve(job.sheet, settingsFor(job), libraryFor(job));
    solved.set(job.id, s);
  }
  return s;
}
