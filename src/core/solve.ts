// Turns a read sheet into geometry, cut lengths and checks.
//
//   cut = centre-to-centre  −  take-out at each end  −  in-line fittings on the run
//         + fusion allowance per fused end (HDPE)   or   − root gap per weld (steel)
//
// Every number keeps its source (coordinates, printed, your library, standard) so the wearer
// can see exactly where it came from. Nothing is guessed silently: missing data stays missing
// and is reported.
import {BRANDS, DEFAULT_SETTINGS, lookup, type Material, type Settings, type TakeoutEntry} from './library.ts';
import {FITTING_NAME, type Fitting, type FittingType, type Leg, type Sheet} from './types.ts';
import {formatLength, parseLength, parseSize, roundTo} from './units.ts';

export interface Vec {
  x: number; // East, inches
  y: number; // North, inches
  z: number; // Elevation, inches
}

export type Source = 'coordinates' | 'printed' | 'elevations' | 'library' | 'standard' | 'derived' | 'none';

export interface SPoint {
  id: string;
  kind: 'center' | 'end';
  pos: Vec | null;
  posSource: 'printed' | 'derived' | 'guess' | 'none';
  label?: string;
  cont?: string;
  fitting?: string;
}

export interface Deduction {
  label: string;
  inches: number | null;
  source: Source;
}

export interface Piece {
  id: string; // P1, P2…
  leg: string;
  from: string;
  to: string;
  cc: number | null;
  ccSource: Source;
  deductions: Deduction[];
  adjust: Deduction[]; // fusion allowance (+) or weld gaps (−)
  net: number | null; // fitting-to-fitting pipe length (no allowance/gap)
  cut: number | null; // what to cut, rounded to 1/16"
  status: 'ok' | 'nopipe' | 'missing' | 'negative';
  printedPipe: number | null;
  printedMatch: boolean | null;
  joints: number;
  welds: string[];
  dir: Vec | null;
  slope?: string | null;
  bomItem?: number | null;
  endsText: [string, string];
  /** How much fitting sits at each end of the centreline run (take-out or in-line body); null = unknown. */
  ends: [number | null, number | null];
  /** The pipe's take-out: everything the fittings at its ends use up (null while a fitting size is unknown). */
  takeout: number | null;
  /** No pipe here: what fuses straight onto what (e.g. the next sheet's 45 onto a wye branch). */
  direct?: string;
}

export interface Port {
  leg: string;
  takeout: number | null;
  source: Source;
  branch: boolean;
  role: 'takeout' | 'branch' | 'outlet';
}

export interface SFitting {
  id: string;
  name: string;
  fitting: Fitting;
  pos: Vec | null;
  ports: Port[];
  welds: string[];
}

export interface SWeld {
  number: string;
  point: string;
  pos: Vec | null;
  joins: string;
  piece?: string;
}

export interface Check {
  level: 'error' | 'warn' | 'info' | 'ok';
  text: string;
  hint?: string;
}

export interface StickPlan {
  stick: number; // 1-based
  pieces: {id: string; cut: number}[];
  used: number;
  offcut: number;
}

export interface Solution {
  material: Material;
  size: number | null;
  points: SPoint[];
  pieces: Piece[];
  fittings: SFitting[];
  welds: SWeld[];
  checks: Check[];
  totalCut: number;
  totalNet: number;
  bomPipe: number | null;
  plan: StickPlan[];
  ready: boolean; // every piece has a cut length and there are no errors
  missing: Missing[]; // fitting values the cuts are waiting on
}

export interface Missing {
  label: string; // '6" 90° elbow'
  type: FittingType;
  size: number | null;
  field: 'takeout' | 'branch' | 'outlet' | 'laying';
  size2?: number | null; // reducer small end
  ports: number;
  suggest?: number; // the value that makes the pipe add up to the BOM total
}

const v = (x: number, y: number, z: number): Vec => ({x, y, z});
const add = (a: Vec, b: Vec) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec, b: Vec) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: Vec, k: number) => v(a.x * k, a.y * k, a.z * k);
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec) => {
  const l = len(a);
  return l > 1e-9 ? mul(a, 1 / l) : null;
};
const TOL = 1 / 8; // inches: how far printed and computed may differ before we flag it

/** "S", "NE", "Up", "S45E", "S 45 E 0.29 Down", "north-east" → unit vector (or null). */
export function parseDirection(raw: string | null | undefined): Vec | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/NORTH/g, 'N').replace(/SOUTH/g, 'S').replace(/EAST/g, 'E').replace(/WEST/g, 'W').replace(/[-_]/g, ' ').trim();
  if (/^(UP|U|RISE|VERTICAL UP)\b/.test(s)) return v(0, 0, 1);
  if (/^(DOWN|D|DROP|VERTICAL DOWN)\b/.test(s)) return v(0, 0, -1);
  // "E 45 S" (from East, 45° toward South) is the same as "S 45 E".
  const bearingEW = /^([EW])\s*(\d+(?:\.\d+)?)\s*°?\s*([NS])/.exec(s);
  if (bearingEW) {
    const a = (parseFloat(bearingEW[2]) * Math.PI) / 180;
    const ew = bearingEW[1] === 'E' ? 1 : -1;
    const ns = bearingEW[3] === 'N' ? 1 : -1;
    return v(Math.cos(a) * ew, Math.sin(a) * ns, 0);
  }
  const bearing = /^([NS])\s*(\d+(?:\.\d+)?)\s*°?\s*([EW])/.exec(s);
  if (bearing) {
    const a = (parseFloat(bearing[2]) * Math.PI) / 180;
    const ns = bearing[1] === 'N' ? 1 : -1;
    const ew = bearing[3] === 'E' ? 1 : -1;
    return v(Math.sin(a) * ew, Math.cos(a) * ns, 0);
  }
  // A rolled leg in the vertical plane: "E 45 Down", "N 30° Up".
  const roll = /^([NS]?)\s*([EW]?)\s*(\d+(?:\.\d+)?)\s*°?\s*(UP|DOWN)$/.exec(s);
  if (roll && (roll[1] || roll[2])) {
    const h = norm(v(roll[2] === 'E' ? 1 : roll[2] === 'W' ? -1 : 0, roll[1] === 'N' ? 1 : roll[1] === 'S' ? -1 : 0, 0))!;
    const a = (parseFloat(roll[3]) * Math.PI) / 180;
    return v(h.x * Math.cos(a), h.y * Math.cos(a), Math.sin(a) * (roll[4] === 'UP' ? 1 : -1));
  }
  const compass = /^([NS]?)\s*([EW]?)\b/.exec(s.replace(/\s+/g, ''));
  if (compass && (compass[1] || compass[2])) {
    const y = compass[1] === 'N' ? 1 : compass[1] === 'S' ? -1 : 0;
    const x = compass[2] === 'E' ? 1 : compass[2] === 'W' ? -1 : 0;
    return norm(v(x, y, 0));
  }
  return null;
}

export const materialOf = (sheet: Sheet): Material => (sheet.joining === 'butt_fusion' || /HDPE|PE\s?\d{4}|POLYETHYLENE/i.test(sheet.material) ? 'hdpe' : 'steel');

function fittingSize(f: Fitting, sheet: Sheet): number | null {
  const s = f.size ? parseSize(f.size.split(/x|×/i)[0]) : null;
  return s ?? parseSize(sheet.size);
}
/** The small end of a reducing fitting ("6\" x 4\"" → 4), if given. */
function fittingSize2(f: Fitting): number | null {
  const parts = f.size?.split(/x|×/i) ?? [];
  return parts.length > 1 ? parseSize(parts[1]) : null;
}
function sizeLabel(f: Fitting, sz: number | null): string {
  const s2 = fittingSize2(f);
  return sz ? (s2 && s2 !== sz ? `${sz}" x ${s2}" ` : `${sz}" `) : '';
}

export function solve(sheet: Sheet, settings: Settings = DEFAULT_SETTINGS, lib: TakeoutEntry[] = []): Solution {
  const checks: Check[] = [];
  const material = materialOf(sheet);
  const size = parseSize(sheet.size);
  const byPoint = new Map(sheet.points.map(p => [p.id, p]));
  const legById = new Map(sheet.legs.map(l => [l.id, l]));
  for (const l of sheet.legs) {
    if (!byPoint.has(l.from) || !byPoint.has(l.to)) checks.push({level: 'error', text: `Run ${l.id} connects to a point that isn't on the sheet (${l.from} → ${l.to}).`});
  }

  // ---- 1. Positions ---------------------------------------------------------------------------
  const pos = new Map<string, Vec>();
  const posSrc = new Map<string, SPoint['posSource']>();
  const el = new Map<string, number>();
  for (const p of sheet.points) {
    if (typeof p.el === 'number') el.set(p.id, p.el * 12);
    if (typeof p.e === 'number' && typeof p.n === 'number' && typeof p.el === 'number') {
      pos.set(p.id, v(p.e * 12, p.n * 12, p.el * 12));
      posSrc.set(p.id, 'printed');
    }
  }
  const legLenGuess = (l: Leg, a: string, b: string): number | null => {
    const printed = parseLength(l.cc);
    if (printed !== null) return printed;
    const dir = parseDirection(l.direction);
    if (dir && Math.abs(dir.z) > 0.2 && el.has(a) && el.has(b)) return Math.abs(el.get(a)! - el.get(b)!) / Math.abs(dir.z);
    return null;
  };
  const propagate = (guessing: boolean) => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of sheet.legs) {
        for (const [a, b, sign] of [
          [l.from, l.to, 1],
          [l.to, l.from, -1],
        ] as const) {
          if (!pos.has(a) || pos.has(b)) continue;
          let dir = parseDirection(l.direction);
          if (!dir && !guessing) continue;
          dir ??= v(1, 0, 0);
          const L = legLenGuess(l, a, b) ?? (guessing ? 48 : null);
          if (L === null) continue;
          const p = pos.get(a)!;
          let next = add(p, mul(dir, L * sign));
          if (Math.abs(dir.z) < 0.9 && el.has(b)) next = v(next.x, next.y, el.get(b)!);
          if (Math.abs(dir.z) > 0.9 && el.has(b)) next = v(p.x, p.y, el.get(b)!);
          // Partial printed coordinates win over derived ones.
          const pt = byPoint.get(b);
          if (pt && typeof pt.e === 'number') next = v(pt.e * 12, next.y, next.z);
          if (pt && typeof pt.n === 'number') next = v(next.x, pt.n * 12, next.z);
          pos.set(b, next);
          posSrc.set(b, guessing && (!parseDirection(l.direction) || legLenGuess(l, a, b) === null) ? 'guess' : 'derived');
          changed = true;
        }
      }
    }
  };
  propagate(false);
  if (pos.size === 0 && sheet.points.length) {
    const first = sheet.points[0];
    pos.set(first.id, v(0, 0, el.get(first.id) ?? 0));
    posSrc.set(first.id, 'guess');
    checks.push({level: 'info', text: 'No full coordinates on this sheet: the model is drawn from directions and dimensions only.'});
  }
  propagate(false);
  if (sheet.points.some(p => !pos.has(p.id))) {
    // Last resort so it can still be drawn: unknown directions run East, unknown lengths 4'.
    propagate(true);
    for (const p of sheet.points)
      if (!pos.has(p.id)) {
        pos.set(p.id, v(0, 0, 0));
        posSrc.set(p.id, 'guess');
      }
    checks.push({level: 'warn', text: 'Some points could not be placed from the drawing; the 3D model is approximate there.', hint: 'Add a direction (N, S, E, W, Up, Down) to each run.'});
  }

  // ---- 2. Fittings and their ports ------------------------------------------------------------
  const fittings: SFitting[] = [];
  const fitAt = new Map<string, SFitting>(); // centre point → fitting
  const missingTakeouts = new Map<string, Missing>(); // "elbow90|6" → count
  const brand = settings.brand ?? 'gf';
  const otherMaker = new Map<string, string>(); // fitting → the other maker whose size was used
  for (const f of sheet.fittings) {
    const sz = fittingSize(f, sheet);
    const found = lookup(lib, f.type, sz, material, fittingSize2(f), brand);
    if (found?.entry.other) otherMaker.set(`${sizeLabel(f, sz)}${FITTING_NAME[f.type]}`, found.entry.other);
    const ports: Port[] = [];
    const legsHere = f.point ? sheet.legs.filter(l => l.from === f.point || l.to === f.point) : [];
    // A lateral's two run ends differ: the heel (the side the branch leans towards) is long, the
    // outlet short. Tell them apart from the geometry.
    const centre = f.point ? pos.get(f.point) : undefined;
    const farEnd = (l: Leg) => pos.get(l.from === f.point ? l.to : l.from);
    // Tees and wyes read without a branch leg: the branch is the leg that isn't in line with another.
    let branchId = f.branchLeg ?? null;
    if (!branchId && (f.type === 'lateral' || f.type === 'tee') && centre && legsHere.length === 3) {
      const dirs = legsHere.map(l => (farEnd(l) ? norm(sub(farEnd(l)!, centre)) : null));
      for (let i = 0; i < 3 && !branchId; i++) {
        const [j, k] = [0, 1, 2].filter(x => x !== i);
        const a = dirs[j];
        const b = dirs[k];
        if (a && b && a.x * b.x + a.y * b.y + a.z * b.z < -0.95) branchId = legsHere[i].id;
      }
    }
    const branchLeg = branchId ? legById.get(branchId) : undefined;
    const branchDir = centre && branchLeg && farEnd(branchLeg) ? norm(sub(farEnd(branchLeg)!, centre)) : null;
    for (const l of legsHere) {
      const branch = !!branchId && branchId === l.id;
      let role: Port['role'] = branch ? 'branch' : 'takeout';
      if (!branch && f.type === 'lateral' && branchDir && centre && farEnd(l)) {
        const d = norm(sub(farEnd(l)!, centre));
        if (d && d.x * branchDir.x + d.y * branchDir.y + d.z * branchDir.z < 0) role = 'outlet';
      }
      const printed = parseLength(f.takeouts?.[l.id] ?? (branch ? f.branchTakeout : f.takeout));
      let takeout: number | null = printed;
      let source: Source = printed !== null ? 'printed' : 'none';
      if (takeout === null && found) {
        const e = found.entry;
        const t = role === 'branch' ? (e.branch ?? null) : role === 'outlet' ? (e.outlet ?? e.takeout) : e.takeout;
        if (t !== null && t !== undefined) {
          takeout = t;
          source = found.source;
        }
      }
      if (takeout === null) {
        const key = `${f.type}|${sz ?? '?'}|${role}`;
        const m = missingTakeouts.get(key) ?? {label: `${sizeLabel(f, sz)}${FITTING_NAME[f.type]}${role === 'branch' ? ' (branch)' : role === 'outlet' ? ' (outlet)' : ''}`, type: f.type, size: sz, size2: fittingSize2(f), field: role, ports: 0};
        m.ports++;
        missingTakeouts.set(key, m);
      }
      ports.push({leg: l.id, takeout, source, branch, role});
    }
    let fp: Vec | null = f.point ? (pos.get(f.point) ?? null) : null;
    if (!fp && f.inlineLeg) {
      const l = legById.get(f.inlineLeg);
      const a = l && pos.get(l.from);
      const b = l && pos.get(l.to);
      const lay = parseLength(f.laying) ?? found?.entry.laying ?? null;
      if (a && b) {
        const d = norm(sub(b, a));
        const half = (lay ?? 12) / 2;
        fp = f.inlineAt === 'to' && d ? sub(b, mul(d, half)) : d ? add(a, mul(d, half)) : a;
      }
    }
    const sf: SFitting = {id: f.id, name: `${sizeLabel(f, sz)}${FITTING_NAME[f.type]}${f.bomItem ? ` (item ${f.bomItem})` : ''}`, fitting: f, pos: fp, ports, welds: []};
    fittings.push(sf);
    if (f.point) fitAt.set(f.point, sf);
  }

  // ---- 3. Pieces ------------------------------------------------------------------------------
  const weldsAt = new Map<string, typeof sheet.welds>();
  for (const w of sheet.welds) weldsAt.set(w.point, [...(weldsAt.get(w.point) ?? []), w]);
  const pieces: Piece[] = [];
  let unsetAllowance = false;
  sheet.legs.forEach((l, i) => {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    const bothPrinted = posSrc.get(l.from) === 'printed' && posSrc.get(l.to) === 'printed';
    const printedCc = parseLength(l.cc);
    let cc: number | null = null;
    let ccSource: Source = 'none';
    const dir = a && b ? norm(sub(b, a)) : null;
    if (bothPrinted && a && b) {
      cc = len(sub(b, a));
      ccSource = 'coordinates';
      if (printedCc !== null) {
        const horiz = Math.hypot(b.x - a.x, b.y - a.y);
        const diff = Math.min(Math.abs(cc - printedCc), Math.abs(horiz - printedCc));
        if (diff > TOL) checks.push({level: 'warn', text: `Run ${l.id}: printed ${formatLength(printedCc)} but the coordinates give ${formatLength(cc)} (off by ${formatLength(diff)}).`, hint: 'Check the dimension and the coordinates on the sheet.'});
      }
    } else if (printedCc !== null) {
      cc = printedCc;
      ccSource = 'printed';
    } else {
      const d = parseDirection(l.direction);
      if (d && Math.abs(d.z) > 0.2 && el.has(l.from) && el.has(l.to)) {
        cc = Math.abs(el.get(l.from)! - el.get(l.to)!) / Math.abs(d.z);
        ccSource = 'elevations';
      } else if (a && b && posSrc.get(l.from) !== 'guess' && posSrc.get(l.to) !== 'guess') {
        cc = len(sub(b, a));
        ccSource = 'derived';
      }
    }

    const deductions: Deduction[] = [];
    const endDed: (number | null)[] = [];
    let joints = 0;
    const welds: string[] = [];
    const endText = (pid: string, side: 'from' | 'to'): string => {
      const pt = byPoint.get(pid);
      const f = fitAt.get(pid);
      const inline = sheet.fittings.find(x => x.inlineLeg === l.id && (x.inlineAt ?? 'from') === side);
      if (inline) {
        const sf = fittings.find(x => x.id === inline.id)!;
        const sz = fittingSize(inline, sheet);
        const found = lookup(lib, inline.type, sz, material, fittingSize2(inline), brand);
        if (found?.entry.other && parseLength(inline.laying) === null) otherMaker.set(`${sizeLabel(inline, sz)}${FITTING_NAME[inline.type]}`, found.entry.other);
        const printed = parseLength(inline.laying);
        const lay = printed ?? found?.entry.laying ?? null;
        deductions.push({label: `${sf.name} body`, inches: lay, source: printed !== null ? 'printed' : lay !== null ? found!.source : 'none'});
        if (lay === null) {
          const key = `${inline.type}|${sz ?? '?'}|laying`;
          const mm = missingTakeouts.get(key) ?? {label: `${sizeLabel(inline, sz)}${FITTING_NAME[inline.type]}`, type: inline.type, size: sz, size2: fittingSize2(inline), field: 'laying', ports: 0};
          mm.ports++;
          missingTakeouts.set(key, mm);
        }
        joints++;
        endDed.push(lay);
        return sf.name;
      }
      if (f) {
        const port = f.ports.find(p => p.leg === l.id);
        deductions.push({label: `${f.name}${port?.branch ? ' branch' : ''}`, inches: port?.takeout ?? null, source: port?.source ?? 'none'});
        joints++;
        endDed.push(port?.takeout ?? null);
        return f.name;
      }
      endDed.push(0);
      // An end point: a weld here means the pipe ends here; otherwise it carries on.
      if ((weldsAt.get(pid) ?? []).length) joints++;
      return pt?.cont ? `Cont. on ${pt.cont.replace(/^.*-(?=[^-]+-\d+$)/, '')}` : (pt?.label ?? 'End');
    };
    const fromText = endText(l.from, 'from');
    const toText = endText(l.to, 'to');
    for (const pid of [l.from, l.to]) {
      for (const w of weldsAt.get(pid) ?? []) {
        // A weld belongs to this piece if it names this leg, or it's the only leg at that point.
        const legsAtPoint = sheet.legs.filter(x => x.from === pid || x.to === pid);
        const centre = fitAt.has(pid);
        if (w.leg ? w.leg === l.id : !centre || legsAtPoint.length === 1) welds.push(w.number);
      }
    }

    const adjust: Deduction[] = [];
    if (sheet.joining === 'butt_fusion') {
      if (settings.fusionAllowance === null) unsetAllowance = unsetAllowance || joints > 0;
      else if (joints && settings.fusionAllowance) {
        const perEnd = settings.allowancePer === 'end';
        adjust.push({label: perEnd ? `Extra × ${joints} fused ends` : 'Extra length', inches: settings.fusionAllowance * (perEnd ? joints : 1), source: 'library'});
      }
    } else if (sheet.joining === 'butt_weld' && joints && settings.rootGap) adjust.push({label: `Root gap × ${joints}`, inches: -settings.rootGap * joints, source: 'library'});
    else if (sheet.joining === 'socket_weld' && joints && settings.socketGap) adjust.push({label: `Socket gap × ${joints}`, inches: -settings.socketGap * joints, source: 'library'});

    let net: number | null = null;
    let cut: number | null = null;
    let status: Piece['status'] = 'missing';
    if (cc !== null && deductions.every(d => d.inches !== null)) {
      net = cc - deductions.reduce((s, d) => s + (d.inches ?? 0), 0);
      const c = net + adjust.reduce((s, d) => s + (d.inches ?? 0), 0);
      if (net < -1 / 4) status = 'negative';
      else if (net < 0.5) status = 'nopipe';
      else status = 'ok';
      cut = status === 'ok' ? roundTo(c) : null;
      net = roundTo(net);
    }
    const printedPipe = parseLength(l.pipe);
    const printedMatch = printedPipe !== null && net !== null && status === 'ok' ? Math.abs(net - printedPipe) <= 1 / 16 + 1e-9 : null;
    if (printedMatch === false)
      checks.push({level: 'warn', text: `Run ${l.id}: the sheet prints pipe ${formatLength(printedPipe)}, the math gives ${formatLength(net)} (off by ${formatLength(Math.abs(net! - printedPipe!))}).`, hint: 'Usually a fitting that is a different size from yours. Check the fittings.'});
    if (status === 'negative') checks.push({level: 'error', text: `Run ${l.id} is shorter than the fittings at its ends (${formatLength(net)}). A fitting size or dimension is wrong.`});
    pieces.push({
      id: `P${i + 1}`,
      leg: l.id,
      from: l.from,
      to: l.to,
      cc,
      ccSource,
      deductions,
      adjust,
      net,
      cut,
      status,
      printedPipe,
      printedMatch,
      joints,
      welds,
      dir,
      slope: l.slope,
      bomItem: l.bomItem,
      endsText: [fromText, toText],
      ends: [endDed[0], endDed[1]],
      takeout: deductions.every(d => d.inches !== null) ? roundTo(deductions.reduce((s, d) => s + (d.inches ?? 0), 0)) : null,
    });
  });
  // Fitting to fitting with no pipe: say what fuses onto what. At a sheet break the next fitting is
  // on the next sheet (drawn dashed past the break); a wye's branch takes a 45 there.
  for (const p of pieces) {
    if (p.status !== 'nopipe') continue;
    const name = (pid: string) => {
      const f = fitAt.get(pid);
      if (!f) return null;
      const port = f.ports.find(x => x.leg === p.leg);
      return `${f.name.replace(/ \(item \d+\)$/, '')}${port?.branch ? ' branch' : port?.role === 'outlet' ? ' outlet' : ''}`;
    };
    [p.from, p.to].forEach((pid, i) => {
      const pt = byPoint.get(pid);
      if (!pt?.cont) return;
      const otherId = i === 0 ? p.to : p.from;
      const f = fitAt.get(otherId);
      const branch = f?.fitting.type === 'lateral' && f.ports.find(x => x.leg === p.leg)?.branch;
      const next = pt.next && FITTING_NAME[pt.next] ? pt.next : branch ? 'elbow45' : null;
      const sheetNo = pt.cont.replace(/^.*-(?=[^-]+-\d+$)/, '');
      if (!next) {
        p.direct = `No pipe on this sheet: the ${name(otherId) ?? 'fitting'} ends right at the break to sheet ${sheetNo}.`;
        return;
      }
      p.endsText[i] = `${FITTING_NAME[next]} (sheet ${sheetNo})`;
      p.direct = `No pipe: the ${FITTING_NAME[next]} on sheet ${sheetNo} fuses straight onto the ${name(otherId) ?? 'fitting'}.`;
    });
    if (!p.direct) {
      const a = name(p.from);
      const b = name(p.to);
      if (a && b) p.direct = `No pipe: the ${a} fuses straight onto the ${b}.`;
    }
  }
  // Number the real pipe pieces 1, 2, 3 (fitting-to-fitting runs get no number).
  let n = 0;
  for (const p of pieces) p.id = p.status === 'nopipe' ? `F${p.leg}` : `P${++n}`;

  // ---- 4. Welds -------------------------------------------------------------------------------
  const welds: SWeld[] = sheet.welds.map(w => {
    const f = fitAt.get(w.point);
    const piece = pieces.find(p => p.welds.includes(w.number));
    const pt = byPoint.get(w.point);
    // What sits on this side of the joint: the pipe piece, or (fitting to fitting) the fitting at the far end.
    const near = !piece ? 'Pipe' : piece.status === 'nopipe' ? piece.endsText[piece.from === w.point ? 1 : 0] : `Pipe ${piece.id}`;
    let joins: string;
    if (f) joins = `${near} ↔ ${f.name}`;
    else if (pt?.cont) joins = piece?.status === 'nopipe' ? `${near} ↔ ${piece.endsText[piece.from === w.point ? 0 : 1]}` : `${near} ↔ sheet ${pt.cont.replace(/^.*-(?=[^-]+-\d+$)/, '')}`;
    else {
      const inl = piece && sheet.fittings.find(x => x.inlineLeg === piece.leg);
      joins = inl ? `${near} ↔ ${fittings.find(x => x.id === inl.id)!.name}` : `${near} ↔ ${pt?.label ?? 'end'}`;
    }
    if (f) f.welds.push(w.number);
    return {number: w.number, point: w.point, pos: pos.get(w.point) ?? null, joins, piece: piece?.id};
  });
  // Welds next to an in-line fitting sit at its end, not on the point itself.
  for (const w of welds) {
    const piece = pieces.find(p => p.id === w.piece);
    if (!piece || !piece.dir || !w.pos) continue;
    const inl = sheet.fittings.find(x => x.inlineLeg === piece.leg && (x.inlineAt ?? 'from') === (piece.from === w.point ? 'from' : 'to'));
    if (!inl) continue;
    const lay = piece.deductions.find(d => d.label.startsWith(fittings.find(f => f.id === inl.id)!.name))?.inches;
    if (lay) w.pos = add(w.pos, mul(piece.dir, piece.from === w.point ? lay : -lay));
  }

  // ---- 5. Checks: take-outs, allowance, bill of materials ---------------------------------------
  for (const [label, maker] of otherMaker)
    checks.push({
      level: 'warn',
      text: `Using the ${maker} size for the ${label}: there's no ${BRANDS[brand]} size on file for it.`,
      hint: 'Check one of the fittings, or set its size in the fitting library.',
    });
  for (const m of missingTakeouts.values())
    checks.push({
      level: 'error',
      text: m.field === 'laying' ? `Need the end-to-end length of the ${m.label}.` : `Need the centre-to-end size of the ${m.label}.`,
      hint: 'It sets the take-out on the pipes it joins. Get it from the fitting maker’s sheet or the drawing.',
    });
  if (unsetAllowance && sheet.joining === 'butt_fusion')
    checks.push({level: 'warn', text: 'Extra length is not set: cuts are shown fitting-to-fitting with nothing added.', hint: 'Set it in Settings from your fusion procedure.'});

  const ok = pieces.filter(p => p.status === 'ok');
  const totalCut = ok.reduce((s, p) => s + (p.cut ?? 0), 0);
  const totalNet = ok.reduce((s, p) => s + (p.net ?? 0), 0);
  const pipeItems = sheet.bom.filter(b => /PIPE/i.test(b.description) && !/ELL|ELBOW|TEE|WYE|LATERAL|REDUC|CAP|COUPL|FLANGE|VALVE/i.test(b.description));
  const bomPipe = pipeItems.length ? pipeItems.reduce((s, b) => s + (parseLength(b.qty) ?? 0), 0) : null;
  if (bomPipe !== null && bomPipe > 0) {
    if (pieces.some(p => p.status === 'missing')) {
      // Solve for a single unknown take-out from the BOM total, as a hint.
      const unknown = [...missingTakeouts.values()];
      if (unknown.length === 1) {
        const known = pieces.filter(p => p.cc !== null).reduce((s, p) => s + p.cc! - p.deductions.reduce((t, d) => t + (d.inches ?? 0), 0), 0);
        const x = (known - bomPipe) / unknown[0].ports;
        if (x > 0 && x < 120) {
          unknown[0].suggest = roundTo(x);
          checks.push({level: 'info', text: `If the ${unknown[0].label} is ${formatLength(x)} ${unknown[0].field === 'laying' ? 'end to end' : 'centre to end'}, the pipe adds up to the BOM total (${formatLength(bomPipe)}).`, hint: 'Only use this if it matches your fitting sheet.'});
        }
      }
    } else {
      const diff = totalNet - bomPipe;
      if (Math.abs(diff) <= 1 / 4) checks.push({level: 'ok', text: `Pipe total ${formatLength(totalNet)} matches the BOM (${formatLength(bomPipe)}).`});
      else
        checks.push({
          level: 'warn',
          text: `Pipe total ${formatLength(totalNet)} vs BOM ${formatLength(bomPipe)} (${diff > 0 ? 'over' : 'under'} by ${formatLength(Math.abs(diff))}).`,
          hint: 'The BOM is often rounded or counts pipe differently; trust the dimensions you can verify.',
        });
    }
  }
  for (const b of sheet.bom.filter(x => !pipeItems.includes(x))) {
    const want = parseInt(b.qty, 10);
    const have = sheet.fittings.filter(f => f.bomItem === b.item).length;
    if (Number.isFinite(want) && have !== want) checks.push({level: 'warn', text: `BOM item ${b.item} lists ${want}, the sheet shows ${have}: ${b.description.slice(0, 60)}`});
  }
  const printedOk = pieces.filter(p => p.printedMatch).length;
  if (printedOk) checks.push({level: 'ok', text: printedOk > 1 ? `${printedOk} pipe lengths match the sheet's printed dimensions.` : `The pipe length matches the sheet's printed dimension.`});
  for (const p of sheet.points)
    if (p.kind === 'end' && p.cont && !(weldsAt.get(p.id) ?? []).length)
      checks.push({level: 'info', text: `${p.label ?? 'An end'} has no weld number here: the joint is on sheet ${p.cont.replace(/^.*-(?=[^-]+-\d+$)/, '')}.`});
  for (const u of sheet.unreadable ?? []) checks.push({level: 'warn', text: `Couldn't read: ${u}`});

  // ---- 6. Stick plan (first fit, longest first) -----------------------------------------------
  const plan: StickPlan[] = [];
  for (const p of [...ok].sort((a, b) => (b.cut ?? 0) - (a.cut ?? 0))) {
    const need = (p.cut ?? 0) + settings.cutWaste;
    let s = plan.find(x => x.offcut >= need);
    if (!s) {
      if (need > settings.stickLength + settings.cutWaste) {
        checks.push({level: 'warn', text: `${p.id} (${formatLength(p.cut)}) is longer than a ${formatLength(settings.stickLength)} stick: it needs a fusion joint or a longer stick.`});
        continue;
      }
      s = {stick: plan.length + 1, pieces: [], used: 0, offcut: settings.stickLength};
      plan.push(s);
    }
    s.pieces.push({id: p.id, cut: p.cut ?? 0});
    s.used += need;
    s.offcut -= need;
  }

  const points: SPoint[] = sheet.points.map(p => ({id: p.id, kind: p.kind, pos: pos.get(p.id) ?? null, posSource: posSrc.get(p.id) ?? 'none', label: p.label, cont: p.cont, fitting: fitAt.get(p.id)?.id}));
  const ready = pieces.every(p => p.status === 'ok' || p.status === 'nopipe') && !checks.some(c => c.level === 'error');
  return {material, size, points, pieces, fittings, welds, checks, totalCut, totalNet, bomPipe, plan, ready, missing: [...missingTakeouts.values()]};
}
