// Phone → glasses, through the database, end-to-end encrypted.
//
// The glasses show a pairing code (8 characters). The phone encrypts each job with a key made
// from that code and drops it in a "box" whose name is a hash of the code. The glasses read their
// box, decrypt, keep the jobs on the glasses, and empty the box. The database only ever holds
// unreadable bytes for a few seconds, and nobody can find a box without the code.
import {request, TIMESTAMP} from '../lib/db.ts';
import type {Job} from './job.ts';

export const CODE_LEN = 8;
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O or U

export function newPairCode(): string {
  const b = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(b);
  return Array.from(b, x => ALPHA[x & 31]).join('');
}

/** Clean up what was typed: uppercase, I/L read as 1, O as 0, dashes and spaces dropped. */
export function normalizeCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .split('')
    .filter(c => ALPHA.includes(c))
    .join('')
    .slice(0, CODE_LEN);
}

export const formatCode = (c: string) => (c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
function b64(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function boxOf(code: string): Promise<{id: string; key: CryptoKey}> {
  const id = hex(await crypto.subtle.digest('SHA-256', enc.encode(`kmr-fitup-box:${code}`))).slice(0, 32);
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`kmr-fitup-key:${code}`));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {id, key};
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const canZip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export interface Sealed {
  iv: string;
  ct: string;
  z?: number;
  t?: unknown;
}

export async function seal(code: string, value: unknown): Promise<Sealed> {
  const {key} = await boxOf(code);
  let data: Uint8Array = enc.encode(JSON.stringify(value));
  const z = canZip() ? 1 : 0;
  if (z) data = await pipe(data, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, data as BufferSource);
  return {iv: b64(iv), ct: b64(ct), ...(z ? {z} : {})};
}

export async function open<T>(code: string, s: Sealed): Promise<T> {
  const {key} = await boxOf(code);
  let data: Uint8Array = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(s.iv) as BufferSource}, key, unb64(s.ct) as BufferSource));
  if (s.z) data = await pipe(data, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

export const MAX_CT = 400000; // must match the database rules

export type SendResult = {ok: true} | {ok: false; why: 'bad' | 'offline' | 'rules' | 'tooBig'};

/** Phone: put a job in the glasses' box. */
export async function sendJob(code: string, job: Job): Promise<SendResult> {
  const c = normalizeCode(code);
  if (c.length !== CODE_LEN) return {ok: false, why: 'bad'};
  if (!crypto.subtle) return {ok: false, why: 'offline'};
  let sealed = await seal(c, job);
  if (sealed.ct.length > MAX_CT && job.thumb) sealed = await seal(c, {...job, thumb: null});
  if (sealed.ct.length > MAX_CT) return {ok: false, why: 'tooBig'};
  const {id} = await boxOf(c);
  try {
    const r = await request(`fitup/${id}/${job.id}.json`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...sealed, t: TIMESTAMP})}, 20000);
    if (r.status === 401 || r.status === 403) return {ok: false, why: 'rules'};
    return r.ok ? {ok: true} : {ok: false, why: 'offline'};
  } catch {
    return {ok: false, why: 'offline'};
  }
}

export type FetchResult = {ok: true; jobs: Job[]} | {ok: false; why: 'offline' | 'rules'};

/** Glasses: collect whatever is in the box, then empty it. */
export async function receiveJobs(code: string): Promise<FetchResult> {
  const {id} = await boxOf(code);
  let box: Record<string, Sealed> | null;
  try {
    const r = await request(`fitup/${id}.json`);
    if (r.status === 401 || r.status === 403) return {ok: false, why: 'rules'};
    if (!r.ok) return {ok: false, why: 'offline'};
    box = await r.json();
  } catch {
    return {ok: false, why: 'offline'};
  }
  if (!box) return {ok: true, jobs: []};
  const jobs: Job[] = [];
  const done: Record<string, null> = {};
  for (const [k, s] of Object.entries(box)) {
    done[k] = null;
    try {
      const j = await open<Job>(code, s);
      if (j && j.sheet && Array.isArray(j.sheet.legs)) jobs.push({...j, id: k});
    } catch {
      /* not ours or damaged: drop it */
    }
  }
  try {
    await request(`fitup/${id}.json`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(done)});
  } catch {
    /* it'll be cleared next time; jobs are de-duplicated by id */
  }
  return {ok: true, jobs};
}
