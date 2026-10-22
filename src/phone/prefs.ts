// What the phone remembers: pairing code, Claude key and model, shop settings, the fitting
// library, and recently sent sheets. All in this browser's local storage only.
import {useSyncExternalStore} from 'react';
import type {Job} from '../core/job.ts';
import {DEFAULT_SETTINGS, type Settings, type TakeoutEntry} from '../core/library.ts';
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
}

const KEY = 'kmr.fitup.phone.v1';
const listeners = new Set<() => void>();
let prefs: Prefs = load();

function load(): Prefs {
  let p: Partial<Prefs> = {};
  try {
    p = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    /* fresh */
  }
  return {
    code: typeof p.code === 'string' ? p.code : '',
    apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    model: typeof p.model === 'string' ? p.model : DEFAULT_MODEL,
    settings: {...DEFAULT_SETTINGS, ...(p.settings ?? {})},
    library: Array.isArray(p.library) ? p.library : [],
    history: Array.isArray(p.history) ? p.history.slice(0, 12) : [],
    spent: p.spent ?? {input: 0, output: 0, reads: 0},
    note: typeof p.note === 'string' ? p.note : '',
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
