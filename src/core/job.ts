// A job is one sheet sent from the phone to the glasses, with everything needed to solve it there.
import {DEFAULT_SETTINGS, type Settings, type TakeoutEntry} from './library.ts';
import type {Sheet} from './types.ts';

export interface Job {
  id: string; // short random id
  name: string; // "0001-6"
  created: number;
  sheet: Sheet;
  settings: Settings;
  library: TakeoutEntry[];
  thumb?: string | null; // small greyscale JPEG of the drawing (data URL)
  demo?: boolean;
}

export interface Progress {
  cut: string[]; // piece ids marked cut
  fused: string[]; // weld numbers marked fused/welded
}

export const newId = (n = 10) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, x => 'abcdefghijkmnpqrstuvwxyz23456789'[x & 31]).join('');
};

/** "AB-1234-UG-0001-6" → "0001-6" (the part a fitter says out loud). */
export function shortName(number: string): string {
  const m = /([^-]+-\d+)$/.exec(number.trim());
  return (m ? m[1] : number.trim()) || 'Sheet';
}

export function makeJob(sheet: Sheet, settings: Settings = DEFAULT_SETTINGS, library: TakeoutEntry[] = [], thumb?: string | null): Job {
  return {id: newId(), name: shortName(sheet.drawing.number), created: Date.now(), sheet, settings, library, thumb: thumb ?? null};
}
