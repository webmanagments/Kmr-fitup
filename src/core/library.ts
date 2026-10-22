// Fitting take-outs (centre-to-end) and the shop settings that go into every cut.
//
// Where a take-out comes from, in order:
//   1. printed on the drawing (always wins),
//   2. your own library (entered once from your fitting manufacturer's sheet),
//   3. built-in standard steel butt-weld fittings (ASME B16.9 long-radius), steel only.
// HDPE molded fittings differ by manufacturer, so there are no built-in HDPE numbers.
import type {FittingType} from './types.ts';

export type Material = 'hdpe' | 'steel';

export interface TakeoutEntry {
  id: string;
  type: FittingType;
  size: number; // nominal size, inches (6 = 6")
  material: Material;
  takeout: number | null; // centre-to-end, inches (run ports); null = not known
  branch?: number | null; // centre-to-end of the branch port (tees, wyes)
  laying?: number | null; // end-to-end of an in-line fitting
  note?: string;
}

export interface Settings {
  /** HDPE: length used up at each fused pipe end (facing + bead). Added to the cut. null = not set yet. */
  fusionAllowance: number | null;
  /** Steel butt weld: root gap per weld. Subtracted from the cut. */
  rootGap: number;
  /** Socket weld: gap left at the bottom of each socket. */
  socketGap: number;
  /** Stick length for planning cuts. */
  stickLength: number;
  /** Lost at each cut (saw kerf / squaring), for stick planning only. */
  cutWaste: number;
}

export const DEFAULT_SETTINGS: Settings = {
  fusionAllowance: null,
  rootGap: 1 / 8,
  socketGap: 1 / 16,
  stickLength: 40 * 12,
  cutWaste: 1 / 4,
};

// ASME B16.9 long-radius butt-weld fittings, centre-to-end in inches. (Standard values; always
// check against the fittings you actually have.)
const LR90 = (nps: number) => (nps <= 0.5 ? 1.5 : 1.5 * nps);
const LR45: Record<string, number> = {
  '0.5': 5 / 8, '0.75': 7 / 16, '1': 7 / 8, '1.25': 1, '1.5': 1 + 1 / 8, '2': 1 + 3 / 8, '2.5': 1 + 3 / 4, '3': 2, '3.5': 2 + 1 / 4, '4': 2 + 1 / 2,
  '5': 3 + 1 / 8, '6': 3 + 3 / 4, '8': 5, '10': 6 + 1 / 4, '12': 7 + 1 / 2, '14': 8 + 3 / 4, '16': 10, '18': 11 + 1 / 4, '20': 12 + 1 / 2, '24': 15,
};
const TEE: Record<string, number> = {
  '0.5': 1, '0.75': 1 + 1 / 8, '1': 1 + 1 / 2, '1.25': 1 + 7 / 8, '1.5': 2 + 1 / 4, '2': 2 + 1 / 2, '2.5': 3, '3': 3 + 3 / 8, '3.5': 3 + 3 / 4, '4': 4 + 1 / 8,
  '5': 4 + 7 / 8, '6': 5 + 5 / 8, '8': 7, '10': 8 + 1 / 2, '12': 10, '14': 11, '16': 12, '18': 13 + 1 / 2, '20': 15, '24': 17,
};

export function builtIn(type: FittingType, size: number, material: Material): TakeoutEntry | null {
  if (material !== 'steel') return null;
  const k = String(size);
  if (type === 'elbow90') return {id: `b16.9-90-${k}`, type, size, material, takeout: LR90(size), note: 'ASME B16.9 long-radius 90°'};
  if (type === 'elbow45' && LR45[k]) return {id: `b16.9-45-${k}`, type, size, material, takeout: LR45[k], note: 'ASME B16.9 long-radius 45°'};
  if (type === 'tee' && TEE[k]) return {id: `b16.9-tee-${k}`, type, size, material, takeout: TEE[k], branch: TEE[k], note: 'ASME B16.9 straight tee'};
  return null;
}

export function lookup(lib: TakeoutEntry[], type: FittingType, size: number | null, material: Material): {entry: TakeoutEntry; source: 'library' | 'standard'} | null {
  if (size === null) return null;
  const mine = lib.find(e => e.type === type && Math.abs(e.size - size) < 1e-6 && e.material === material);
  if (mine) return {entry: mine, source: 'library'};
  const std = builtIn(type, size, material);
  return std ? {entry: std, source: 'standard'} : null;
}
