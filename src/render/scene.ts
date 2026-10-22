// Builds a 3D model (in inches, plant axes: x East, y North, z Up) of the finished spool from a
// solved sheet: pipe pieces between fitting ends, bent elbows, wyes, welds and sheet breaks.
// Each shape belongs to a "part" the wearer can select.
import type {Piece, Solution, Vec} from '../core/solve.ts';
import {FITTING_NAME, type Sheet} from '../core/types.ts';
import {formatLength} from '../core/units.ts';

export type PartKind = 'pipe' | 'fitting' | 'joint';

export interface Part {
  id: string; // piece id (P1), fitting id (F1)
  kind: PartKind;
  title: string;
  center: Vec;
  radius: number; // rough size, for framing
  min?: Vec; // bounding box of the part's shapes
  max?: Vec;
}

export interface Tube {
  pts: Vec[]; // a polyline (2 points for straight pipe, more for an elbow bend)
  r: number;
  kind: 'pipe' | 'fitting' | 'nopipe';
  part: string;
  unknown?: boolean; // drawn from a guessed size (take-out not known)
  ghost?: boolean; // the next sheet's fitting, shown dashed past a sheet break
}

export interface Ring {
  p: Vec;
  dir: Vec;
  r: number;
  weld: string;
  part: string | null;
}

export interface Tag {
  p: Vec;
  text: string;
  part: string | null;
  kind: 'piece' | 'end' | 'fitting';
  dir?: Vec;
}

export interface Model {
  tubes: Tube[];
  rings: Ring[];
  tags: Tag[];
  parts: Part[];
  min: Vec;
  max: Vec;
  od: number;
}

// Outside diameters of IPS / NPS pipe, inches.
const OD: Record<string, number> = {
  '0.5': 0.84, '0.75': 1.05, '1': 1.315, '1.25': 1.66, '1.5': 1.9, '2': 2.375, '2.5': 2.875, '3': 3.5, '4': 4.5, '5': 5.563, '6': 6.625, '8': 8.625,
  '10': 10.75, '12': 12.75, '14': 14, '16': 16, '18': 18, '20': 20, '22': 22, '24': 24, '26': 26, '28': 28, '30': 30, '32': 32, '36': 36,
};
export const outsideDiameter = (nps: number | null) => (nps ? (OD[String(nps)] ?? nps) : 6.625);

const v = (x: number, y: number, z: number): Vec => ({x, y, z});
const add = (a: Vec, b: Vec) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec, b: Vec) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: Vec, k: number) => v(a.x * k, a.y * k, a.z * k);
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec) => {
  const l = len(a);
  return l > 1e-9 ? mul(a, 1 / l) : v(1, 0, 0);
};
const mid = (a: Vec, b: Vec) => mul(add(a, b), 0.5);

/** A guess used only for drawing when a take-out is unknown. */
function visualTakeout(type: string, nps: number): number {
  if (type === 'elbow90') return nps * 1.5;
  if (type === 'elbow45') return nps * 0.65;
  if (type === 'elbow22' || type === 'elbow11') return nps * 0.4;
  if (type === 'tee' || type === 'lateral') return nps;
  return nps * 0.5;
}

export function buildModel(sheet: Sheet, sol: Solution): Model {
  const nps = sol.size ?? 6;
  const od = outsideDiameter(sol.size);
  const r = od / 2;
  const posOf = new Map(sol.points.map(p => [p.id, p.pos]));
  const legOf = new Map(sheet.legs.map(l => [l.id, l]));
  const tubes: Tube[] = [];
  const rings: Ring[] = [];
  const tags: Tag[] = [];
  const parts: Part[] = [];
  const portEnd = new Map<string, Vec>(); // `${leg}|${point}` → where the pipe meets the fitting

  // Where each leg's pipe starts and ends (after the fittings at its ends).
  const pieceEnds = (p: Piece): [Vec, Vec] | null => {
    const a = posOf.get(p.from);
    const b = posOf.get(p.to);
    if (!a || !b) return null;
    const d = unit(sub(b, a));
    const L = len(sub(b, a));
    const f = sheet.fittings.find(x => x.point === p.from) ?? sheet.fittings.find(x => x.inlineLeg === p.leg && (x.inlineAt ?? 'from') === 'from');
    const t = sheet.fittings.find(x => x.point === p.to) ?? sheet.fittings.find(x => x.inlineLeg === p.leg && x.inlineAt === 'to');
    let da = p.ends[0] ?? (f ? visualTakeout(f.type, nps) : 0);
    let db = p.ends[1] ?? (t ? visualTakeout(t.type, nps) : 0);
    if (da + db > L) {
      const k = L / (da + db || 1);
      da *= k;
      db *= k;
    }
    return [add(a, mul(d, da)), sub(b, mul(d, db))];
  };

  // Pipe pieces.
  for (const p of sol.pieces) {
    const ends = pieceEnds(p);
    if (!ends) continue;
    const [a, b] = ends;
    portEnd.set(`${p.leg}|${p.from}`, a);
    portEnd.set(`${p.leg}|${p.to}`, b);
    const kind = p.status === 'nopipe' ? 'nopipe' : 'pipe';
    if (kind === 'pipe') {
      tubes.push({pts: [a, b], r, kind, part: p.id});
      parts.push({id: p.id, kind: 'pipe', title: `${p.id} · ${formatLength(p.cut ?? p.net)}`, center: mid(a, b), radius: Math.max(len(sub(b, a)) / 2, r)});
      tags.push({p: mid(a, b), text: p.id, part: p.id, kind: 'piece', dir: unit(sub(b, a))});
    }
  }

  // Fittings.
  for (const f of sol.fittings) {
    const ft = f.fitting;
    if (ft.point) {
      const c = posOf.get(ft.point);
      if (!c) continue;
      const ends: Vec[] = [];
      for (const port of f.ports) {
        const leg = legOf.get(port.leg);
        if (!leg) continue;
        const other = posOf.get(leg.from === ft.point ? leg.to : leg.from);
        if (!other) continue;
        const d = unit(sub(other, c));
        const known = portEnd.get(`${port.leg}|${ft.point}`);
        ends.push(known ?? add(c, mul(d, port.takeout ?? visualTakeout(ft.type, nps))));
      }
      const unknown = f.ports.some(p => p.takeout === null);
      if (/^elbow/.test(ft.type) && ends.length === 2) {
        // A bend: quadratic curve from one port end through the centre's pull to the other.
        const pts: Vec[] = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const a = mul(ends[0], (1 - t) * (1 - t));
          const b = mul(c, 2 * t * (1 - t));
          const e = mul(ends[1], t * t);
          pts.push(add(add(a, b), e));
        }
        tubes.push({pts, r: r * 1.08, kind: 'fitting', part: f.id, unknown});
      } else if (ends.length) {
        for (const e of ends) tubes.push({pts: [c, e], r: r * 1.08, kind: 'fitting', part: f.id, unknown});
      } else {
        // A fitting on a single end (cap, cleanout top): a short stub.
        tubes.push({pts: [c, add(c, v(0, 0, od))], r: r * 1.15, kind: 'fitting', part: f.id, unknown});
      }
      parts.push({id: f.id, kind: 'fitting', title: f.name, center: c, radius: Math.max(r * 2, ...ends.map(e => len(sub(e, c))))});
      tags.push({p: c, text: FITTING_NAME[ft.type].replace(' elbow', '').replace('45° lateral wye', 'Wye'), part: f.id, kind: 'fitting'});
    } else if (ft.inlineLeg && f.pos) {
      const leg = legOf.get(ft.inlineLeg);
      const a = leg && posOf.get(leg.from);
      const b = leg && posOf.get(leg.to);
      if (!a || !b) continue;
      const d = unit(sub(b, a));
      const piece = sol.pieces.find(p => p.leg === ft.inlineLeg);
      const lay = (ft.inlineAt === 'to' ? piece?.ends[1] : piece?.ends[0]) ?? null;
      const L = lay ?? visualTakeout(ft.type, nps) * 2;
      const s = ft.inlineAt === 'to' ? sub(b, mul(d, L)) : a;
      const e = add(s, mul(d, L));
      tubes.push({pts: [s, e], r: r * 1.2, kind: 'fitting', part: f.id, unknown: lay === null});
      parts.push({id: f.id, kind: 'fitting', title: f.name, center: mid(s, e), radius: Math.max(L / 2, r * 2)});
      tags.push({p: mid(s, e), text: FITTING_NAME[ft.type], part: f.id, kind: 'fitting'});
    }
  }

  // Welds / fusion joints.
  for (const w of sol.welds) {
    const piece = sol.pieces.find(p => p.id === w.piece);
    let p = w.pos;
    let dir = v(1, 0, 0);
    if (piece) {
      const e = portEnd.get(`${piece.leg}|${w.point}`);
      if (e) p = e;
      if (piece.dir) dir = piece.dir;
    }
    if (p) rings.push({p, dir, r: r * 1.25, weld: w.number, part: piece && piece.status !== 'nopipe' ? piece.id : null});
  }

  // Ends: sheet breaks and terminals.
  for (const pt of sol.points) {
    if (pt.kind !== 'end' || !pt.pos) continue;
    const leg = sheet.legs.find(l => l.from === pt.id || l.to === pt.id);
    const other = leg && posOf.get(leg.from === pt.id ? leg.to : leg.from);
    const dir = other ? unit(sub(pt.pos, other)) : v(1, 0, 0);
    let text = pt.cont ? `→ ${pt.cont.replace(/^.*-(?=[^-]+-\d+$)/, '')}` : (pt.label ?? 'End');
    let tagAt = pt.pos;
    // A 45 fused straight onto a wye branch at a sheet break: draw it dashed, turning the branch
    // square to the run (as the drawing's dashed bend shows).
    const piece = leg && sol.pieces.find(p => p.leg === leg.id);
    const wye = leg && sol.fittings.find(f => f.fitting.type === 'lateral' && f.fitting.point === (leg.from === pt.id ? leg.to : leg.from));
    const next = sheet.points.find(x => x.id === pt.id)?.next ?? (wye?.ports.find(x => x.leg === leg!.id)?.branch ? 'elbow45' : null);
    if (pt.cont && piece?.status === 'nopipe' && wye && next === 'elbow45') {
      const runLeg = wye.ports.map(x => legOf.get(x.leg)).find(l => l && l.id !== leg!.id);
      const runOther = runLeg && posOf.get(runLeg.from === wye.fitting.point ? runLeg.to : runLeg.from);
      const c = posOf.get(wye.fitting.point!);
      if (runOther && c) {
        const run = unit(sub(runOther, c));
        const along = dir.x * run.x + dir.y * run.y + dir.z * run.z;
        const out = unit(sub(dir, mul(run, along)));
        const k = visualTakeout('elbow45', nps);
        const bend = add(pt.pos, mul(dir, k));
        const end = add(bend, mul(out, k));
        const pts: Vec[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          pts.push(add(add(mul(pt.pos, (1 - t) * (1 - t)), mul(bend, 2 * t * (1 - t))), mul(end, t * t)));
        }
        tubes.push({pts, r: r * 1.08, kind: 'fitting', part: `next-${pt.id}`, ghost: true});
        text = `45 ${text}`;
        tagAt = end;
      }
    }
    tags.push({p: tagAt, text, part: null, kind: 'end', dir});
  }

  for (const part of parts) {
    const pts = tubes.filter(t => t.part === part.id).flatMap(t => t.pts);
    if (!pts.length) continue;
    part.min = v(Math.min(...pts.map(p => p.x)), Math.min(...pts.map(p => p.y)), Math.min(...pts.map(p => p.z)));
    part.max = v(Math.max(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y)), Math.max(...pts.map(p => p.z)));
  }
  const all = [...tubes.flatMap(t => t.pts), ...tags.map(t => t.p)];
  const min = all.length ? v(Math.min(...all.map(p => p.x)), Math.min(...all.map(p => p.y)), Math.min(...all.map(p => p.z))) : v(0, 0, 0);
  const max = all.length ? v(Math.max(...all.map(p => p.x)), Math.max(...all.map(p => p.y)), Math.max(...all.map(p => p.z))) : v(1, 1, 1);

  // Selection order: follow the pipe from the first leg, fittings as you meet them.
  const order: Part[] = [];
  const seen = new Set<string>();
  const take = (id: string | undefined) => {
    const p = id && parts.find(x => x.id === id);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      order.push(p);
    }
  };
  for (const piece of sol.pieces) {
    take(sol.fittings.find(f => f.fitting.point === piece.from || (f.fitting.inlineLeg === piece.leg && (f.fitting.inlineAt ?? 'from') === 'from'))?.id);
    take(piece.id);
    take(sol.fittings.find(f => f.fitting.point === piece.to || (f.fitting.inlineLeg === piece.leg && f.fitting.inlineAt === 'to'))?.id);
  }
  for (const p of parts) take(p.id);
  return {tubes, rings, tags, parts: order, min, max, od};
}
