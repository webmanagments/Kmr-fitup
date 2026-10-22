// Live scan: judge camera frames on the phone (free and instant, no AI calls) and decide when a
// frame is good enough to send to Claude. A frame is ready when the phone is steady, the sheet
// fills the view, the light is right, and it's as sharp as this camera gets.

export interface Frame {
  w: number;
  h: number;
  data: Uint8ClampedArray; // RGBA
}

export interface Measure {
  brightness: number; // mean luma 0-255
  glare: number; // share of blown-out pixels
  paper: number; // share of the frame that looks like paper (bright, colourless)
  sharpness: number; // mean |laplacian| over the paper
  motion: number; // mean luma change since the last frame (0 for the first)
}

export const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Greyscale copy of an RGBA frame. */
export function grey(f: Frame): Float32Array {
  const g = new Float32Array(f.w * f.h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = luma(f.data[i], f.data[i + 1], f.data[i + 2]);
  return g;
}

export function measure(f: Frame, prev: Float32Array | null): {m: Measure; g: Float32Array} {
  const g = grey(f);
  const n = g.length;
  let sum = 0;
  let blown = 0;
  let paper = 0;
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = f.data[i];
    const gg = f.data[i + 1];
    const b = f.data[i + 2];
    sum += g[j];
    const hi = Math.max(r, gg, b);
    const lo = Math.min(r, gg, b);
    if (hi >= 250 && lo >= 245) blown++;
    if (hi >= 130 && hi - lo <= 45) paper++;
  }
  // Sharpness: how crisp the ink lines are, measured only where there's detail.
  let lap = 0;
  let count = 0;
  const {w, h} = f;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      const v = Math.abs(4 * g[k] - g[k - 1] - g[k + 1] - g[k - w] - g[k + w]);
      if (v > 6) {
        lap += v;
        count++;
      }
    }
  }
  let motion = 0;
  if (prev && prev.length === n) {
    let d = 0;
    for (let j = 0; j < n; j++) d += Math.abs(g[j] - prev[j]);
    motion = d / n;
  }
  return {
    m: {brightness: sum / n, glare: blown / n, paper: paper / n, sharpness: count ? (lap / count) * Math.min(1, (count / n) * 20) : 0, motion},
    g,
  };
}

export type CheckId = 'steady' | 'sheet' | 'light' | 'sharp';
export interface Verdict {
  ok: Record<CheckId, boolean>;
  tip: string; // what to do next, in plain words
  ready: boolean;
}

export interface Judge {
  push: (m: Measure, now: number) => Verdict;
  best: () => number;
}

/**
 * Keeps a little memory: sharpness is judged against the sharpest frame this camera has given
 * in the last few seconds (every phone and distance is different), and a frame only counts as
 * ready once everything has been good for a moment. After a while without a lock it relaxes a
 * little, so it never waits forever.
 */
export function makeJudge(opts: {needPaper?: number; holdMs?: number} = {}): Judge {
  const needPaper = opts.needPaper ?? 0.32;
  const holdMs = opts.holdMs ?? 700;
  const recent: {t: number; s: number}[] = [];
  let goodSince = -1;
  let started = -1;
  return {
    best: () => Math.max(0, ...recent.map(r => r.s)),
    push(m, now) {
      if (started < 0) started = now;
      recent.push({t: now, s: m.sharpness});
      while (recent.length && now - recent[0].t > 4000) recent.shift();
      const best = Math.max(...recent.map(r => r.s));
      const relax = now - started > 8000 ? 0.85 : 1;
      const ok: Record<CheckId, boolean> = {
        steady: m.motion < 4.5 / relax,
        sheet: m.paper >= needPaper * relax,
        light: m.brightness > 60 && m.brightness < 240 && m.glare < 0.04,
        sharp: m.sharpness > 4 && m.sharpness >= best * 0.8 * relax,
      };
      const tip = !ok.sheet
        ? m.paper < needPaper * 0.5
          ? 'Point at the sheet'
          : 'Move closer: fill the screen with the sheet'
        : !ok.light
          ? m.glare >= 0.04
            ? 'Glare: tilt the phone a little'
            : m.brightness <= 60
              ? 'Too dark: more light'
              : 'Too bright'
          : !ok.steady
            ? 'Hold still'
            : !ok.sharp
              ? 'Focusing…'
              : 'Hold it…';
      const all = ok.steady && ok.sheet && ok.light && ok.sharp;
      if (!all) goodSince = -1;
      else if (goodSince < 0) goodSince = now;
      return {ok, tip, ready: all && now - goodSince >= holdMs};
    },
  };
}
