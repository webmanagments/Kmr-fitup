// Photo handling on the phone: load, rotate, and shrink for Claude (sharp) and for the glasses
// (small, greyscale).

export interface Photo {
  id: string;
  url: string; // object URL of the original
  rot: 0 | 90 | 180 | 270;
  w: number;
  h: number;
}

export async function loadPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  const img = await imageOf(url);
  return {id: Math.random().toString(36).slice(2), url, rot: 0, w: img.naturalWidth, h: img.naturalHeight};
}

function imageOf(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not open that image'));
    img.src = url;
  });
}

/** Draw the photo rotated and scaled so its long edge is at most `maxEdge`. */
async function render(p: Photo, maxEdge: number, grey: boolean): Promise<HTMLCanvasElement> {
  const img = await imageOf(p.url);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const side = p.rot === 90 || p.rot === 270;
  const c = document.createElement('canvas');
  c.width = side ? h : w;
  c.height = side ? w : h;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((p.rot * Math.PI) / 180);
  if (grey) ctx.filter = 'grayscale(1) contrast(1.15)';
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

const b64of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

/** For Claude: long edge up to 2576 px, JPEG, kept under maxLen of base64 (3.7 MB alone; less each when there are several). */
export async function forClaude(p: Photo, maxLen = 3_700_000): Promise<{mediaType: 'image/jpeg'; data: string}> {
  const c = await render(p, 2576, false);
  for (const q of [0.88, 0.8, 0.7, 0.6, 0.5, 0.4]) {
    const data = b64of(c.toDataURL('image/jpeg', q));
    if (data.length < maxLen || q === 0.4) return {mediaType: 'image/jpeg', data};
  }
  throw new Error('unreachable');
}

/** For the glasses' drawing viewer: greyscale, small enough to travel with the sheet. */
export async function forGlasses(p: Photo, maxLen = 240_000): Promise<string> {
  for (const [edge, q] of [
    [1400, 0.6],
    [1200, 0.5],
    [1000, 0.45],
    [800, 0.4],
    [700, 0.4],
  ] as const) {
    const url = (await render(p, edge, true)).toDataURL('image/jpeg', q);
    if (url.length < maxLen) return url;
  }
  return (await render(p, 600, true)).toDataURL('image/jpeg', 0.4);
}
