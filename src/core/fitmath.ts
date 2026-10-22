// The fitter's everyday trigonometry: offsets, rolling offsets, elbow take-outs at any angle,
// miters and equal-spread offsets. Pure functions on inches and degrees.

export const ANGLES = [11.25, 22.5, 30, 45, 60, 90] as const;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Simple offset: the pipe between two elbows of `angle` covering a `set` (offset distance). */
export function offset(set: number, angle: number) {
  const a = rad(angle);
  return {
    travel: set / Math.sin(a), // centre to centre along the angled pipe
    run: set / Math.tan(a), // how far along the line the offset takes
    multiplier: 1 / Math.sin(a), // travel = set × multiplier (45° → 1.414)
  };
}

/** Rolling offset: rise (vertical) and roll (horizontal) make a true offset, then as a simple offset. */
export function rollingOffset(rise: number, roll: number, angle: number) {
  const trueOffset = Math.hypot(rise, roll);
  return {trueOffset, ...offset(trueOffset, angle)};
}

export type Radius = 'LR' | 'SR' | '3D' | '5D';
/** Bend radius for a butt-weld elbow or a pipe bend (inches). LR = 1.5 × NPS (1 1/2" minimum), SR = 1 × NPS. */
export function bendRadius(nps: number, r: Radius = 'LR'): number {
  if (r === 'SR') return nps;
  if (r === '3D') return 3 * nps;
  if (r === '5D') return 5 * nps;
  return nps <= 0.5 ? 1.5 : 1.5 * nps;
}

/** Take-out (centre to end) of an elbow or bend of any angle: R × tan(angle ÷ 2). */
export function elbowTakeout(nps: number, angle: number, r: Radius | number = 'LR'): number {
  const R = typeof r === 'number' ? r : bendRadius(nps, r);
  return R * Math.tan(rad(angle) / 2);
}

/** Cut from a travel: centre-to-centre minus the two fittings' take-outs, plus or minus the joint allowance. */
export function cutFromTravel(travel: number, takeoutA: number, takeoutB: number, perJoint = 0) {
  return travel - takeoutA - takeoutB + 2 * perJoint;
}

/**
 * Mitered turn of `turn` degrees made from `pieces` pieces (2 = one weld). Each end cut is
 * turn ÷ (2 × welds); the cut-back on the outside of the pipe is OD × tan(cut angle).
 */
export function miter(od: number, turn: number, pieces: number) {
  const welds = Math.max(1, pieces - 1);
  const cut = turn / (2 * welds);
  return {welds, cutAngle: cut, cutback: od * Math.tan(rad(cut))};
}

/** Equal-spread offset: in a bank of parallel pipes, each next pipe's offset grows by spread × tan(angle ÷ 2). */
export function equalSpread(spread: number, angle: number) {
  return {difference: spread * Math.tan(rad(angle) / 2)};
}

/** Which fitting angle gives a travel for a set (for odd angles). */
export function angleFor(set: number, run: number) {
  return (Math.atan2(set, run) * 180) / Math.PI;
}
