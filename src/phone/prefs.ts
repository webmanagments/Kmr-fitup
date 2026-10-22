// What the phone remembers: pairing code, Claude key and model, shop settings, the fitting
// library, and recently sent sheets. All in this browser's local storage only.
import {useSyncExternalStore} from 'react';
import type {Job} from '../core/job.ts';
import {DEFAULT_SETTINGS, saneAllowance, type Settings, type TakeoutEntry} from '../core/library.ts';
import {DEFAULT_MODEL} from '../core/reader.ts';

export interface Prefs {
  code: string;
  apiKey: string;
  model: string;
  settings: Settings;
  library: TakeoutEntry[];
  history: {id: string; name: string; at: number; job: Job}[];
  spent: {input: number; output: number; reads: number};
  note: string; // standing instructions for Claude, kept between sheets
  autoCheck: boolean; // second look when the reading doesn't add up
  brandChosen?: boolean; // the fitting maker was picked by hand (else the app's default is used)
  fixed?: number; // one-time clean-ups already applied
  noteCleared?: string; // a note taken out by a clean-up (shown once so the fitter knows)
}

/** A note asking for extra pipe length belongs in Setup, not in the reading instructions. */
export const lengthNote = (line: string) => /\b(leave|add|extra|longer|allow|cut)\b/i.test(line) && /(\d|one|two|three)\s*(feet|foot|ft|'|inch|inches|in\b|")/i.test(line);

const KEY = 'kmr.fitup.phone.v1';
const listeners = new Set<() => void>();
let prefs: Prefs = load();
try {
  // Keep any fix made while loading (e.g. an extra length typed in feet instead of inches).
  if (localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(prefs));
} catch {
  /* private mode */
}

function load(): Prefs {
  let p: Partial<Prefs> = {};
  try {
    p = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    /* fresh */
  }
  const fixed = typeof p.fixed === 'number' ? p.fixed : 0;
  let note = typeof p.note === 'string' ? p.note : '';
  let noteCleared = typeof p.noteCleared === 'string' ? p.noteCleared : undefined;
  let settings: Settings = saneAllowance({...DEFAULT_SETTINGS, ...(p.settings ?? {}), ...(p.brandChosen ? {} : {brand: DEFAULT_SETTINGS.brand})});
  if (fixed < 2) {
    // Oct 2026: "leave 2 feet" had been typed as a note to Claude, and the extra length meant to
    // be 3" once per pipe. Move it where it belongs.
    const keep = note.split('\n').filter(l => !lengthNote(l));
    if (keep.length !== note.split('\n').length) {
      noteCleared = note;
      note = keep.join('\n').trim();
    }
    if (settings.fusionAllowance === null) settings = {...settings, fusionAllowance: 3, allowancePer: 'pipe'};
  }
  return {
    fixed: 2,
    noteCleared,
    code: typeof p.code === 'string' ? p.code : '',
    apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    model: typeof p.model === 'string' ? p.model : DEFAULT_MODEL,
    settings,
    brandChosen: !!p.brandChosen,
    library: Array.isArray(p.library) ? p.library : [],
    history: Array.isArray(p.history) ? p.history.slice(0, 12) : [],
    spent: p.spent ?? {input: 0, output: 0, reads: 0},
    note,
    autoCheck: p.autoCheck !== false,
  };
}

export function setPrefs(next: Partial<Prefs>) {
  prefs = {...prefs, ...next};
  for (let i = 0; i < 3; i++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
      break;
    } catch {
      // Too big: drop the oldest history entries (they carry drawing thumbnails).
      if (!prefs.history.length) break;
      prefs = {...prefs, history: prefs.history.slice(0, Math.floor(prefs.history.length / 2))};
    }
  }
  for (const l of listeners) l();
}

export const getPrefs = () => prefs;
export function usePrefs(): Prefs {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
