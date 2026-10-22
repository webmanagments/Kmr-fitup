// Feet-inch lengths the way they're printed on isometrics: 22'-11 1/4", 8 1/2", 2'-2 11/16", 5/8".
// Everything inside the app is kept in decimal inches; it is only rounded when shown.

const PRIMES = /[′’‘`´]/g;
const DPRIMES = /[″“”]|''/g;

/** Read a printed length. Returns inches, or null if it can't be read. */
export function parseLength(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.trim().replace(PRIMES, "'").replace(DPRIMES, '"').replace(/[–—−]/g, '-').replace(/\s+/g, ' ');
  if (!s) return null;
  s = s.replace(/\b(feet|foot|ft)\b\.?/gi, "'").replace(/\b(inches|inch|in)\b\.?/gi, '"');
  let feet = 0;
  let rest = s;
  const fm = /^(\d+(?:\.\d+)?)\s*'\s*-?\s*/.exec(s);
  if (fm) {
    feet = parseFloat(fm[1]);
    rest = s.slice(fm[0].length);
  } else if (/^\d+(?:\.\d+)?\s*'$/.test(s)) {
    return parseFloat(s) * 12;
  }
  rest = rest.replace(/"/g, '').trim();
  if (!rest) return fm ? feet * 12 : null;
  const inches = parseInches(rest);
  if (inches === null) return null;
  return feet * 12 + inches;
}

/** "11 1/4", "1-1/2", "5/8", "6", "9.875" → inches. */
function parseInches(s: string): number | null {
  let m = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return parseFloat(m[1]);
  m = /^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) return +m[1] + +m[2] / +m[3];
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) return +m[1] / +m[2];
  return null;
}

/** Round to the nearest 1/16" (or another fraction). */
export const roundTo = (inches: number, den = 16) => Math.round(inches * den) / den;

/** 275.25 → 22'-11 1/4"   8.5 → 8 1/2"   -0.25 → -1/4" */
export function formatLength(inches: number | null | undefined, den = 16): string {
  if (inches === null || inches === undefined || !Number.isFinite(inches)) return '—';
  const neg = inches < 0;
  let total = Math.round(Math.abs(inches) * den);
  const feet = Math.floor(total / (12 * den));
  total -= feet * 12 * den;
  const whole = Math.floor(total / den);
  let num = total - whole * den;
  let d = den;
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    d /= 2;
  }
  const frac = num ? `${num}/${d}` : '';
  const inch = whole && frac ? `${whole} ${frac}` : whole ? `${whole}` : frac || '0';
  const out = feet ? `${feet}'-${inch}"` : `${inch}"`;
  return neg ? `-${out}` : out;
}

/** Decimal feet (coordinates and elevations are printed in feet). */
export const ftToIn = (ft: number) => ft * 12;
export const inToFt = (inches: number) => inches / 12;

/** Nominal pipe size text → number: 6" → 6, 1-1/2" → 1.5, 3/4 → 0.75. */
export function parseSize(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  const s = raw.replace(/["″]|in\b|nps|ips|dn/gi, '').trim();
  return parseInches(s);
}

export const formatSize = (n: number | null) => (n === null ? '?' : `${formatLength(n).replace('"', '')}"`);
