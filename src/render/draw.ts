// Draws a Model on a 2D canvas with a simple orthographic camera and painter's sorting.
// Made for an additive display: black is see-through, so everything is bright lines on black.
import type {Vec} from '../core/solve.ts';
import type {Model, Part} from './scene.ts';

export interface Camera {
  yaw: number; // radians, 0 = looking north
  pitch: number; // radians above the horizon
  target: Vec; // world point at the centre of the view
  scale: number; // pixels per inch
}

export interface DrawOpts {
  width: number;
  height: number;
  selected?: string | null;
  done?: Set<string>; // piece ids cut
  fused?: Set<string>; // weld numbers done
  labels?: boolean;
  dpr?: number;
  theme?: 'glasses' | 'phone';
}

export const ISO_YAW = (-45 * Math.PI) / 180;
export const ISO_PITCH = (35.264 * Math.PI) / 180;

/** World → screen (x right, y down) plus depth (bigger = farther). */
export function project(cam: Camera, p: Vec, w: number, h: number): {x: number; y: number; d: number} {
  const x = p.x - cam.target.x;
  const y = p.y - cam.target.y;
  const z = p.z - cam.target.z;
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const u = x * cy - y * sy; // screen right
  const w0 = x * sy + y * cy; // into the screen (horizontal)
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const up = z * cp + w0 * sp;
  const d = w0 * cp - z * sp;
  return {x: w / 2 + u * cam.scale, y: h / 2 - up * cam.scale, d};
}

/** A camera that fits the points (or a part) in the view. */
export function fitCamera(model: Model, yaw: number, pitch: number, w: number, h: number, part?: Part | null, pad = 36): Camera {
  const pts: Vec[] = [];
  if (part) {
    // The part itself plus a margin, so its neighbours show for context.
    const m = Math.max(model.od * 5, part.radius * 0.35);
    const lo = part.min ?? part.center;
    const hi = part.max ?? part.center;
    for (const x of [lo.x - m, hi.x + m]) for (const y of [lo.y - m, hi.y + m]) for (const z of [lo.z - m, hi.z + m]) pts.push({x, y, z});
  } else
    for (const x of [model.min.x, model.max.x]) for (const y of [model.min.y, model.max.y]) for (const z of [model.min.z, model.max.z]) pts.push({x, y, z});
  const target = part ? part.center : {x: (model.min.x + model.max.x) / 2, y: (model.min.y + model.max.y) / 2, z: (model.min.z + model.max.z) / 2};
  const probe: Camera = {yaw, pitch, target, scale: 1};
  let maxX = 1;
  let maxY = 1;
  for (const p of pts) {
    const s = project(probe, p, 0, 0);
    maxX = Math.max(maxX, Math.abs(s.x));
    maxY = Math.max(maxY, Math.abs(s.y));
  }
  const scale = Math.min((w / 2 - pad) / maxX, (h / 2 - pad) / maxY);
  return {yaw, pitch, target, scale: Math.max(0.05, Math.min(scale, 40))};
}

export const lerpCam = (a: Camera, b: Camera, t: number): Camera => {
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return {
    yaw: a.yaw + dy * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    target: {x: a.target.x + (b.target.x - a.target.x) * t, y: a.target.y + (b.target.y - a.target.y) * t, z: a.target.z + (b.target.z - a.target.z) * t},
    scale: Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * t),
  };
};

const COL = {
  glasses: {pipe: '#4fd1ff', pipeHi: '#c9f3ff', done: '#3dff8a', fitting: '#ffb23d', fitHi: '#ffe2a8', sel: '#ffffff', unknown: '#ff4d6d', weld: '#9aa7b8', fused: '#3dff8a', end: '#8c9bb0', text: '#e9f1fb', dim: 0.32, grid: 'rgba(120,140,170,0.22)'},
  phone: {pipe: '#2b9fd8', pipeHi: '#a9e4ff', done: '#1fbf63', fitting: '#e8912a', fitHi: '#ffd59a', sel: '#ffffff', unknown: '#ff4d6d', weld: '#9aa7b8', fused: '#1fbf63', end: '#8c9bb0', text: '#e9f1fb', dim: 0.4, grid: 'rgba(120,140,170,0.18)'},
};

export function drawModel(ctx: CanvasRenderingContext2D, model: Model, cam: Camera, o: DrawOpts): void {
  const {width: w, height: h} = o;
  const dpr = o.dpr ?? 1;
  const c = COL[o.theme ?? 'glasses'];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = (p: Vec) => project(cam, p, w, h);
  const sel = o.selected ?? null;
  const alphaFor = (part: string | null) => (!sel || part === sel ? 1 : c.dim);

  // Compass: a small North arrow and the ground plane direction.
  const n0 = P(cam.target);
  const n1 = P({x: cam.target.x, y: cam.target.y + 1, z: cam.target.z});
  const ang = Math.atan2(n1.y - n0.y, n1.x - n0.x);
  ctx.save();
  ctx.translate(w - 34, h - 34);
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(ang);
  ctx.fillStyle = c.end;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-6, -6);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-ang);
  ctx.fillStyle = c.text;
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', Math.cos(ang) * 30, Math.sin(ang) * 30);
  ctx.restore();

  // Painter's order: farthest segments first.
  type Seg = {a: {x: number; y: number}; b: {x: number; y: number}; d: number; width: number; col: string; hi: string; alpha: number; dash: boolean; selected: boolean};
  const segs: Seg[] = [];
  for (const t of model.tubes) {
    const width = Math.max(3, t.r * 2 * cam.scale);
    const isSel = t.part === sel;
    const done = t.kind === 'pipe' && o.done?.has(t.part);
    const col = t.unknown ? c.unknown : t.kind === 'fitting' ? c.fitting : done ? c.done : c.pipe;
    const hi = t.unknown ? '#ffc2cc' : t.kind === 'fitting' ? c.fitHi : done ? '#c4ffd9' : c.pipeHi;
    for (let i = 0; i < t.pts.length - 1; i++) {
      const a = P(t.pts[i]);
      const b = P(t.pts[i + 1]);
      segs.push({a, b, d: (a.d + b.d) / 2, width, col, hi, alpha: alphaFor(t.part), dash: !!t.unknown, selected: isSel});
    }
  }
  segs.sort((p, q) => q.d - p.d);
  for (const s of segs) {
    ctx.globalAlpha = s.alpha;
    if (s.selected) {
      ctx.strokeStyle = c.sel;
      ctx.lineWidth = s.width + 6;
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = s.width + 2;
      ctx.stroke();
    }
    ctx.setLineDash(s.dash ? [Math.max(4, s.width), Math.max(4, s.width * 0.8)] : []);
    ctx.strokeStyle = s.col;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.stroke();
    // A thin highlight down one side gives the pipe some roundness.
    if (s.width >= 6 && !s.dash) {
      const nx = -(s.b.y - s.a.y);
      const ny = s.b.x - s.a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const off = s.width * 0.22;
      ctx.strokeStyle = s.hi;
      ctx.lineWidth = Math.max(1.2, s.width * 0.18);
      ctx.beginPath();
      ctx.moveTo(s.a.x - (nx / nl) * off, s.a.y - (ny / nl) * off);
      ctx.lineTo(s.b.x - (nx / nl) * off, s.b.y - (ny / nl) * off);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Welds: rings across the pipe.
  for (const r of model.rings) {
    const p = P(r.p);
    const q = P({x: r.p.x + r.dir.x, y: r.p.y + r.dir.y, z: r.p.z + r.dir.z});
    const ang2 = Math.atan2(q.y - p.y, q.x - p.x);
    const R = Math.max(5, r.r * cam.scale);
    const fused = o.fused?.has(r.weld);
    ctx.globalAlpha = !sel || r.part === sel ? 1 : c.dim;
    ctx.strokeStyle = fused ? c.fused : c.weld;
    ctx.lineWidth = fused ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, R, Math.max(2, R * 0.38), ang2 + Math.PI / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Labels.
  if (o.labels !== false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of model.tags) {
      const p = P(t.p);
      if (t.kind === 'piece') {
        const isSel = t.part === sel;
        ctx.globalAlpha = !sel || isSel ? 1 : 0.45;
        ctx.font = `800 ${isSel ? 16 : 13}px system-ui, sans-serif`;
        const tw = ctx.measureText(t.text).width + 10;
        const off = Math.max(10, model.od * cam.scale * 0.5 + 12);
        ctx.fillStyle = '#000';
        ctx.fillRect(p.x - tw / 2, p.y - off - 10, tw, 20);
        ctx.fillStyle = isSel ? c.sel : c.text;
        ctx.fillText(t.text, p.x, p.y - off);
      } else if (t.kind === 'end') {
        ctx.globalAlpha = sel ? 0.6 : 0.95;
        ctx.font = '700 12px system-ui, sans-serif';
        const q = t.dir ? P({x: t.p.x + t.dir.x, y: t.p.y + t.dir.y, z: t.p.z + t.dir.z}) : p;
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        const lx = Math.min(w - 40, Math.max(40, p.x + dx * 30));
        const ly = Math.min(h - 14, Math.max(14, p.y + dy * 30));
        ctx.fillStyle = c.end;
        ctx.fillText(t.text, lx, ly);
      } else if (t.part === sel) {
        ctx.globalAlpha = 1;
        ctx.font = '800 14px system-ui, sans-serif';
        const tw = ctx.measureText(t.text).width + 10;
        ctx.fillStyle = '#000';
        ctx.fillRect(p.x - tw / 2, p.y + 14, tw, 20);
        ctx.fillStyle = c.fitHi;
        ctx.fillText(t.text, p.x, p.y + 24);
      }
    }
  }
  ctx.globalAlpha = 1;
}
