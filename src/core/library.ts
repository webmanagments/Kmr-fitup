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
  size: number; // nominal size, inches (6 = 6"); for a reducer, the big end
  size2?: number | null; // reducer small end (6" x 4" → 4)
  material: Material;
  takeout: number | null; // centre-to-end, inches (run ports); null = not known
  branch?: number | null; // centre-to-end of the branch port (tees, wyes)
  outlet?: number | null; // laterals: centre to the outlet end (the run end the branch points away from); null = same as takeout
  laying?: number | null; // end-to-end of an in-line fitting
  note?: string;
  other?: string; // a catalog size from a different maker than the job's (shown as a warning)
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
  /** Who made the molded HDPE fittings on the job (their sizes differ by maker). */
  brand: Brand;
}

export const DEFAULT_SETTINGS: Settings = {
  fusionAllowance: null,
  rootGap: 1 / 8,
  socketGap: 1 / 16,
  stickLength: 40 * 12,
  cutWaste: 1 / 4,
  brand: 'integrifuse',
};

// ASME B16.9 long-radius butt-weld fittings, centre-to-end in inches. (Standard values; always
// check against the fittings you actually have.)
const LR90 = (nps: number) => (nps <= 0.5 ? 1.5 : 1.5 * nps);
const LR45: Record<string, number> = {
  '0.5': 5 / 8, '0.75': 7 / 16, '1': 7 / 8, '1.25': 1, '1.5': 1 + 1 / 8, '2': 1 + 3 / 8, '2.5': 1 + 3 / 4, '3': 2, '3.5': 2 + 1 / 4, '4': 2 + 1 / 2,
  '5': 3 + 1 / 8, '6': 3 + 3 / 4, '8': 5, '10': 6 + 1 / 4, '12': 7 + 1 / 2, '14': 8 + 3 / 4, '16': 10, '18': 11 + 1 / 4, '20': 12 + 1 / 2, '24': 15,
};
// ASME B16.9 concentric reducer end-to-end (H) by the large end, and cap length (E).
const REDUCER_H: Record<string, number> = {'0.75': 1.5, '1': 2, '1.25': 2, '1.5': 2.5, '2': 3, '2.5': 3.5, '3': 3.5, '3.5': 4, '4': 4, '5': 5, '6': 5.5, '8': 6, '10': 7, '12': 8, '14': 13, '16': 14, '18': 15, '20': 20, '24': 20};
const CAP_E: Record<string, number> = {'1': 1.5, '1.25': 1.5, '1.5': 1.5, '2': 1.5, '2.5': 1.5, '3': 2, '3.5': 2.5, '4': 2.5, '5': 3, '6': 3.5, '8': 4, '10': 5, '12': 6, '14': 6.5, '16': 7, '18': 8, '20': 9, '24': 10.5};
// ASME B16.5 class 150 weld-neck flange, length through hub (weld end to face).
const WN150: Record<string, number> = {'0.5': 1.875, '0.75': 2.0625, '1': 2.1875, '1.25': 2.25, '1.5': 2.4375, '2': 2.5, '2.5': 2.75, '3': 2.75, '3.5': 2.8125, '4': 3, '5': 3.5, '6': 3.5, '8': 4, '10': 4, '12': 4.5, '14': 5, '16': 5, '18': 5.5, '20': 5.6875, '24': 6};
const TEE: Record<string, number> = {
  '0.5': 1, '0.75': 1 + 1 / 8, '1': 1 + 1 / 2, '1.25': 1 + 7 / 8, '1.5': 2 + 1 / 4, '2': 2 + 1 / 2, '2.5': 3, '3': 3 + 3 / 8, '3.5': 3 + 3 / 4, '4': 4 + 1 / 8,
  '5': 4 + 7 / 8, '6': 5 + 5 / 8, '8': 7, '10': 8 + 1 / 2, '12': 10, '14': 11, '16': 12, '18': 13 + 1 / 2, '20': 15, '24': 17,
};

// ---- Molded HDPE butt-fusion fittings, IPS SDR 11, by maker ---------------------------------
// Centre-to-end in inches (tees: run and branch). Makers differ by up to ~2", so the job's maker
// is a setting. Sources:
//  - GF Central Plastics, IPS & DIPS Industrial & Municipal catalog: butt 90° and 45° elbows "z",
//    equal tees overall "z" (run = z ÷ 2) and branch "z2". These are the sizes the Black & Veatch
//    sheets were drawn with: sheets -6 (6"), -11 (4"), -13 and -2 (6") add up to their bills of
//    materials to the 1/16" with them.
//  - Integrifuse (Integrity Fusion Products), product dimension sheets Rev. 072026-A (the fittings
//    on site: item 100013 = 6" 45, item 100906 = 6" wye): 90° / 45° "A" = centre to end (matches
//    the tee's centre-to-branch "B" and the crew's 90 ≈ 9", 45 ≈ 6"); tees "A" overall run, "B"
//    centre to branch end; reducers and caps "A" overall length. Lateral wyes: "A" overall run,
//    "B" centre to outlet end, "C" centre to branch end, so centre to heel = A − B (the sheets
//    don't label the letters: this is the reading that fits the drawing; measure one to be sure).
//    Flange adapters "D" (length) from the earlier Integrifuse catalog.
export type Brand = 'gf' | 'integrifuse';
export const BRANDS: Record<Brand, string> = {gf: 'GF Central Plastics', integrifuse: 'Integrifuse'};

interface MakerTable {
  e90: Record<string, number>;
  e45: Record<string, number>;
  tee: Record<string, [number, number]>;
  reducer: Record<string, number>; // "6x4" → end to end
  cap: Record<string, number>;
  flange: Record<string, number>; // flange adapter length
  lateral: Record<string, [number, number, number]>; // heel, outlet, branch (centre to end)
}
const MAKERS: Record<Brand, MakerTable> = {
  gf: {
    e90: {'2': 4.68, '3': 6.75, '4': 6.38, '6': 8.63, '8': 11.1, '10': 13.38, '12': 15.25},
    e45: {'2': 3.5, '3': 5.3, '4': 6.25, '6': 8.5, '8': 9.75, '10': 13.38, '12': 15.88},
    tee: {'2': [4.64, 4.5], '3': [5.88, 5.88], '4': [7.25, 7.25], '6': [9, 9], '8': [11.75, 11.75], '10': [13.38, 13.5], '12': [16, 15.88]},
    reducer: {},
    cap: {},
    flange: {},
    lateral: {},
  },
  integrifuse: {
    e90: {'2': 4.72, '3': 6.5, '4': 6.94, '6': 8.8, '8': 11.25},
    e45: {'2': 3.4, '3': 4.46, '4': 5.14, '6': 6.46, '8': 7.18},
    tee: {'2': [4.55, 4.75], '3': [5.92, 6.0], '4': [6.925, 7.0], '6': [9.055, 9.06], '8': [11.7, 11.6]},
    reducer: {'3x2': 7.72, '4x2': 7.76, '4x3': 9.0, '6x3': 11.42, '6x4': 11.42, '8x6': 12.8},
    cap: {'2': 3.3, '3': 4.58, '4': 5.2, '6': 7.08, '8': 8.68},
    flange: {'2': 6.1, '3': 6.1, '4': 6.1, '6': 8.07, '8': 10.67},
    // 6": the figures your drawings add up with (34 7/16" overall = Integrifuse's catalog length).
    lateral: {'2': [18.46, 5.28, 13.1], '3': [17.92, 6.0, 13.46], '4': [22.22, 5.74, 20.5], '6': [26.6875, 7.75, 27.375], '8': [30.0, 6.5, 27.7]},
  },
};
const sixteenth = (x: number) => Math.round(x * 16) / 16;

// Fittings as modelled on the Black & Veatch HDPE isometrics (line 13WWD / 23WWD sheets). Worked
// out from sheets whose pipe totals match their bills of materials to the 1/16":
//  - 6" x 6" molded 45° lateral wye: centre (where the branch meets the run) to the heel end
//    2'-2 11/16", to the outlet end 7 3/4", to the branch end 2'-3 3/8" (34 7/16" overall, the
//    Integrifuse wye's catalog length). Sheet 10WWD -3 settles the outlet: two wyes, and the long
//    run comes out at exactly one 40' stick.
//  - 6" cleanout (typical CO1): the top point to the face the pipe fuses to, 7 3/8".
//  - 6" x 4" concentric reducer: 9 1/4" end to end.
// A floor-drain hub end (BU … TYPE A) takes nothing: the pipe runs to the printed point.
const SHEETS = 'From the B&V HDPE isometrics (matches their BOMs)';

function makerFitting(brand: Brand, type: FittingType, size: number, material: Material, size2?: number | null): TakeoutEntry | null {
  const t = MAKERS[brand];
  const k = String(size);
  const note = `${BRANDS[brand]} molded, IPS SDR 11 catalog`;
  const id = `${brand}-${type}-${k}${size2 ? `x${size2}` : ''}`;
  if (type === 'elbow90' && t.e90[k]) return {id, type, size, material, takeout: sixteenth(t.e90[k]), note};
  if (type === 'elbow45' && t.e45[k]) return {id, type, size, material, takeout: sixteenth(t.e45[k]), note};
  if (type === 'tee' && t.tee[k]) return {id, type, size, material, takeout: sixteenth(t.tee[k][0]), branch: sixteenth(t.tee[k][1]), note};
  if (type === 'reducer' && size2 && t.reducer[`${k}x${size2}`]) return {id, type, size, size2, material, takeout: null, laying: sixteenth(t.reducer[`${k}x${size2}`]), note};
  if (type === 'cap' && t.cap[k]) return {id, type, size, material, takeout: sixteenth(t.cap[k]), laying: sixteenth(t.cap[k]), note};
  if (type === 'lateral' && t.lateral[k]) {
    const [heel, outlet, branch] = t.lateral[k];
    return {id, type, size, material, takeout: sixteenth(heel), outlet: sixteenth(outlet), branch: sixteenth(branch), note: `${note} (centre to heel / outlet / branch)`};
  }
  if (type === 'flange' && t.flange[k]) return {id, type, size, material, takeout: sixteenth(t.flange[k]), laying: sixteenth(t.flange[k]), note: `${BRANDS[brand]} flange adapter`};
  return null;
}

function sheetFitting(type: FittingType, size: number, material: Material, size2?: number | null): TakeoutEntry | null {
  if (type === 'lateral' && size === 6) return {id: 'bv-lateral-6', type, size, material, takeout: 26.6875, outlet: 7.75, branch: 27.375, note: SHEETS};
  if (type === 'cleanout' && size === 6) return {id: 'bv-cleanout-6', type, size, material, takeout: null, laying: 7.375, note: SHEETS};
  if (type === 'reducer' && size === 6 && size2 === 4) return {id: 'bv-reducer-6x4', type, size, size2: 4, material, takeout: null, laying: 9.25, note: SHEETS};
  return null;
}

/**
 * A catalog size for a fitting. HDPE: the job's maker first, then the sizes worked out from the
 * B&V sheets, then the other maker (marked as such so the app can say so).
 */
export function builtIn(type: FittingType, size: number, material: Material, size2?: number | null, brand: Brand = 'gf'): TakeoutEntry | null {
  const k = String(size);
  if (material === 'hdpe') {
    // The B&V-derived 6"x4" reducer is the GF-drawn one; the maker's own table wins when it has one.
    const own = makerFitting(brand, type, size, material, size2);
    if (own) return own;
    const drawn = sheetFitting(type, size, material, size2);
    if (drawn) return drawn;
    const otherBrand = (Object.keys(MAKERS) as Brand[]).find(b => b !== brand)!;
    const other = makerFitting(otherBrand, type, size, material, size2);
    return other ? {...other, other: BRANDS[otherBrand]} : null;
  }
  if (type === 'elbow90') return {id: `b16.9-90-${k}`, type, size, material, takeout: LR90(size), note: 'ASME B16.9 long-radius 90°'};
  if (type === 'elbow45' && LR45[k]) return {id: `b16.9-45-${k}`, type, size, material, takeout: LR45[k], note: 'ASME B16.9 long-radius 45°'};
  if (type === 'tee' && TEE[k]) return {id: `b16.9-tee-${k}`, type, size, material, takeout: TEE[k], branch: TEE[k], note: 'ASME B16.9 straight tee'};
  // Odd-angle elbows: long-radius, R × tan(angle ÷ 2).
  if (type === 'elbow22') return {id: `lr-22-${k}`, type, size, material, takeout: sixteenth(LR90(size) * Math.tan((11.25 * Math.PI) / 180)), note: 'Long-radius cut elbow, R × tan(11 1/4°)'};
  if (type === 'elbow11') return {id: `lr-11-${k}`, type, size, material, takeout: sixteenth(LR90(size) * Math.tan((5.625 * Math.PI) / 180)), note: 'Long-radius cut elbow, R × tan(5 5/8°)'};
  if (type === 'reducer' && REDUCER_H[k]) return {id: `b16.9-red-${k}`, type, size, size2: size2 ?? null, material, takeout: null, laying: REDUCER_H[k], note: 'ASME B16.9 concentric reducer'};
  if (type === 'cap' && CAP_E[k]) return {id: `b16.9-cap-${k}`, type, size, material, takeout: CAP_E[k], laying: CAP_E[k], note: 'ASME B16.9 cap'};
  if (type === 'flange' && WN150[k]) return {id: `b16.5-wn150-${k}`, type, size, material, takeout: WN150[k], laying: WN150[k], note: 'ASME B16.5 class 150 weld neck (add the gasket)'};
  return null;
}

export function lookup(lib: TakeoutEntry[], type: FittingType, size: number | null, material: Material, size2?: number | null, brand: Brand = 'gf'): {entry: TakeoutEntry; source: 'library' | 'standard'} | null {
  if (size === null) return null;
  const same2 = (e: TakeoutEntry) => !e.size2 || !size2 || Math.abs(e.size2 - size2) < 1e-6;
  const mine = lib.find(e => e.type === type && Math.abs(e.size - size) < 1e-6 && e.material === material && same2(e));
  if (mine) return {entry: mine, source: 'library'};
  const std = builtIn(type, size, material, size2, brand);
  return std ? {entry: std, source: 'standard'} : null;
}
