// Fitting take-outs (centre-to-end) and the shop settings that go into every cut.
//
// Where a take-out comes from, in order:
//   1. printed on the drawing (always wins),
//   2. your own library (entered once from your fitting manufacturer's sheet),
//   3. built-in catalog values:
//      - HDPE: GF Central Plastics molded butt-fusion fittings, IPS DR11 (90s, 45s, equal tees).
//        These are what the sample sheets' bills of materials were worked out with: sheet -6
//        adds up to its BOM to the 1/16" with them. Other makers differ by up to ~1.5" (a 6"
//        Integrifuse 45 is 6.89"), so check the fittings on your job.
//      - Steel: ASME B16.9 long-radius butt-weld fittings.
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

// GF Central Plastics IPS DR11 molded butt fittings (industrial HDPE catalog), centre-to-end "z"
// in inches. Tees: run centre-to-end is half the overall length z; branch is z2.
const HDPE90: Record<string, number> = {'2': 4.68, '3': 6.75, '4': 6.38, '6': 8.63, '8': 11.1, '10': 13.38, '12': 15.25};
const HDPE45: Record<string, number> = {'2': 3.5, '3': 5.3, '4': 6.25, '6': 8.5, '8': 9.75, '10': 13.38, '12': 15.88};
const HDPETEE: Record<string, [number, number]> = {'2': [4.64, 4.5], '3': [5.88, 5.88], '4': [7.25, 7.25], '6': [9, 9], '8': [11.75, 11.75], '10': [13.38, 13.5], '12': [16, 15.88]};
const sixteenth = (x: number) => Math.round(x * 16) / 16;

export function builtIn(type: FittingType, size: number, material: Material): TakeoutEntry | null {
  const k = String(size);
  if (material === 'hdpe') {
    const note = 'GF Central Plastics molded, IPS DR11 catalog';
    if (type === 'elbow90' && HDPE90[k]) return {id: `gf-90-${k}`, type, size, material, takeout: sixteenth(HDPE90[k]), note};
    if (type === 'elbow45' && HDPE45[k]) return {id: `gf-45-${k}`, type, size, material, takeout: sixteenth(HDPE45[k]), note};
    if (type === 'tee' && HDPETEE[k]) return {id: `gf-tee-${k}`, type, size, material, takeout: sixteenth(HDPETEE[k][0]), branch: sixteenth(HDPETEE[k][1]), note};
    return null;
  }
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
