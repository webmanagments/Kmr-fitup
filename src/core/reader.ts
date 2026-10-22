// Reads an isometric photo with Claude (vision), straight from the phone with the user's own key.
// The model fills in a fixed structure (a forced tool call), copying numbers exactly as printed.
// The app does every calculation itself; the model only reads.
import {DEFAULT_SETTINGS, type Settings, type TakeoutEntry} from './library.ts';
import {makerFits} from './makers.ts';
import {SHEET_13} from './samples.ts';
import {solve} from './solve.ts';
import {FITTING_NAME, type Fitting, type Joining, type Leg, type Point, type Sheet, type Weld, type BomItem, type FittingType} from './types.ts';

export const MODELS = [
  {id: 'claude-opus-5-5', name: 'Opus 5.5 (most accurate)'},
  {id: 'claude-sonnet-5-5', name: 'Sonnet 5.5 (faster, cheaper)'},
];
export const DEFAULT_MODEL = MODELS[0].id;
export const API_URL = 'https://api.anthropic.com/v1/messages';

const FITTING_TYPES: FittingType[] = ['elbow90', 'elbow45', 'elbow22', 'elbow11', 'tee', 'lateral', 'reducer', 'coupling', 'flange', 'valve', 'cap', 'cleanout', 'other'];
const JOININGS: Joining[] = ['butt_fusion', 'butt_weld', 'socket_weld', 'threaded', 'other'];
const S = {type: 'string'};
const SN = {type: ['string', 'null']};
const NN = {type: ['number', 'null']};

export const SHEET_TOOL = {
  name: 'record_isometric',
  description: 'Record everything read from one single-line piping isometric drawing, exactly as printed.',
  input_schema: {
    type: 'object',
    required: ['drawing', 'size', 'material', 'joining', 'points', 'legs', 'fittings', 'welds', 'bom', 'unreadable', 'confidence'],
    properties: {
      drawing: {
        type: 'object',
        required: ['number'],
        properties: {
          number: {...S, description: 'Drawing number from the title block, e.g. AB-1234-UG-0001-6'},
          rev: SN,
          title: SN,
          project: SN,
          line: {...SN, description: 'Line number, e.g. 6-WD-L-0001'},
          pipeClass: SN,
          installSpec: SN,
          notes: {type: 'array', items: S},
        },
      },
      size: {...S, description: 'Main nominal pipe size, e.g. 6"'},
      material: {...S, description: 'Pipe material as described, e.g. 6" IPS SDR 11 HDPE PE4710'},
      joining: {type: 'string', enum: JOININGS, description: 'HDPE / PE pipe is butt_fusion. Carbon or stainless steel butt-weld fittings is butt_weld.'},
      points: {
        type: 'array',
        description: 'Every fitting centre (elbow, tee, wye intersection) and every end of the pipe on this sheet (continuations, equipment, cleanout tops, drains). In flow order where possible.',
        items: {
          type: 'object',
          required: ['id', 'kind'],
          properties: {
            id: {...S, description: 'Short id: P1, P2…'},
            kind: {type: 'string', enum: ['center', 'end']},
            e: {...NN, description: 'East coordinate in feet, only if printed at this point'},
            n: {...NN, description: 'North coordinate in feet, only if printed'},
            el: {...NN, description: 'Centreline elevation in feet (EL+), only if printed for this point'},
            label: {...SN, description: 'Printed tag at this point, e.g. "Cont. on -3", "CO-12 TYPE CO1", "FD-101 TYPE A"'},
            cont: {...SN, description: 'Full drawing number this end continues on, if any'},
            next: {
              type: ['string', 'null'],
              enum: ['elbow90', 'elbow45', 'elbow22', 'elbow11', 'tee', 'lateral', 'reducer', 'coupling', 'flange', 'valve', 'cap', 'cleanout', 'other', null],
              description: 'At a Cont-on end: the next sheet\'s first fitting when it is drawn dashed just past the end (a dashed bend = an elbow). Null if none is drawn.',
            },
          },
        },
      },
      legs: {
        type: 'array',
        description: 'Straight centreline runs between two points. Every pipe piece lies on exactly one leg.',
        items: {
          type: 'object',
          required: ['id', 'from', 'to', 'direction'],
          properties: {
            id: {...S, description: 'L1, L2…'},
            from: S,
            to: S,
            direction: {
              ...SN,
              description: 'Direction of travel from→to in plant axes using the north arrow: N, S, E, W, NE, Up, Down, a bearing like "S45E", or a rolled leg like "E 45 Down".',
            },
            cc: {...SN, description: 'A printed dimension that spans exactly this leg point-to-point (centre-to-centre, or centre-to-end). Copy exactly, e.g. 22\'-11 1/4". null if none.'},
            pipe: {...SN, description: 'A printed dimension of just the pipe on this leg (fitting end to fitting end), if the sheet shows one.'},
            slope: {...SN, description: 'e.g. 0.5%'},
            bomItem: NN,
          },
        },
      },
      fittings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'type'],
          properties: {
            id: {...S, description: 'F1, F2…'},
            type: {type: 'string', enum: FITTING_TYPES},
            bomItem: NN,
            point: {...SN, description: 'Centre point id (elbows, tees, wyes, end caps/cleanouts that sit on a point).'},
            inlineLeg: {...SN, description: 'For a fitting sitting in-line on a leg instead (coupling, valve, cleanout body): that leg id.'},
            inlineAt: {type: ['string', 'null'], enum: ['from', 'to', null]},
            angle: NN,
            size: {...SN, description: 'e.g. 6" or 6" x 4"'},
            takeout: {...SN, description: 'Printed centre-to-end dimension of the run ports, if shown.'},
            branchTakeout: {...SN, description: 'Printed centre-to-end of the branch port, if shown.'},
            branchLeg: {...SN, description: 'For tees and wyes: the leg id on the branch.'},
            takeouts: {type: ['object', 'null'], additionalProperties: S, description: 'When ports differ (laterals): printed centre-to-end by leg id, e.g. {"L1":"2\'-2 11/16\\""}.'},
            laying: {...SN, description: 'Printed end-to-end length of an in-line fitting.'},
            note: SN,
          },
        },
      },
      welds: {
        type: 'array',
        description: 'Weld / fusion joint numbers (often handwritten in circles with a leader to the joint) and field-weld markers.',
        items: {
          type: 'object',
          required: ['number', 'point'],
          properties: {
            number: {...S, description: 'e.g. "1145". For an unnumbered field weld use "FW1", "FW2"…'},
            point: {...S, description: 'The point the joint is at (or nearest to).'},
            leg: {...SN, description: 'At a fitting with several legs: which leg’s pipe end this joint is on.'},
            type: {...SN, description: 'e.g. FW (field weld)'},
          },
        },
      },
      bom: {
        type: 'array',
        items: {
          type: 'object',
          required: ['item', 'description', 'qty'],
          properties: {item: {type: 'number'}, size1: SN, size2: SN, description: S, qty: {...S, description: 'Exactly as printed: 26\'-4 11/16" for pipe, 1 for fittings'}, spec: SN},
        },
      },
      unreadable: {type: 'array', items: S, description: 'Anything you could not read with confidence. Never guess a number; list it here instead.'},
      confidence: {type: 'string', enum: ['high', 'medium', 'low']},
    },
  },
} as const;

const EXAMPLE_READING = JSON.stringify(SHEET_13);

export const SYSTEM = `You read single-line piping isometric drawings (pipefitting / fusion weld maps) for a fitter in the field.
Your output feeds a calculator that works out cut lengths, so exact reading matters more than anything else.

READ EXACTLY
- Copy every dimension, coordinate and elevation EXACTLY as printed. Never round, convert, add up or guess. If a digit or fraction is unclear, put null and say what in "unreadable".
- Coordinates (E 3117.36 / N 3219.80 / EL+ 3351.88) are decimal feet. Dimensions are feet-inches (23'-3 5/16", 11 15/16"). Elevation callouts are to the pipe centreline.
- Dimension text is often printed rotated along the dimension line; read it in that direction.

MODEL THE PIPE AS POINTS AND LEGS
- A point is a fitting centre (where the centrelines meet) or an end of the pipe on this sheet. Make a leg for every straight centreline run between two points, including very short ones between two fittings that fuse straight together.
- End points: a "Cont on: <drawing number>" box with coordinates (cont = that full drawing number; label "Cont. on -12"); a floor drain / hub ("BU-1304 TYPE: A": label it, no fitting there, the pipe runs to the printed point); a cleanout top ("CO-1301 TYPE: CO1" with coordinates: an end point, and the cleanout is a fitting of type cleanout sitting in-line at that end: inlineLeg = the riser leg, inlineAt = the end it is at).
- Past a "Cont on" end the drawing often shows the next sheet's first fitting as a dashed ghost: a dashed curve is an elbow fused straight on there (on these sheets, the dashed bend right on a wye's branch is a 45° elbow: next = "elbow45"). Record it as "next" on that end point. It is not on this sheet's BOM.
- A boxed group "3 / EL+ 3353.03 / 45°" tags the fitting at that point: BOM item 3, centre elevation 3353.03, a 45° fitting. "2 / EL+ 3352.01" is item 2 (look the item up in the BOM to know the fitting type).
- Lateral wye: its point is where the branch centreline meets the run. Make one leg to each run side and one leg up the branch; set branchLeg.
- Concentric reducer at a sheet break or between pipes: in-line fitting on that leg (inlineLeg/inlineAt), size "6\" x 4\"" (big end first).
- A field joint in the middle of a straight run (two pipes fused end to end: an X with a weld number and an "FW" box but no fitting, often where a 40' stick runs out): make a point there (kind "center", label "Joint", no fitting) and split the run into two legs at it, each with its own dimension. Record the joint at that point.
- Directions: give EVERY leg a direction of travel from→to in plant axes: N, S, E, W, NE, Up, Down, a bearing like "S45W"/"N45E", or a rolled leg like "W 45 Down". Use printed coordinates first (compare the E and N of points on the same run), then direction labels on the drawing ("N 45 E 0.29 Up" or "E 45 S 0.21 Up" mean that branch runs at 45° between those two directions, rising a little; copy them as printed), then the north arrow (usually top-left). Vertical risers and drops are Up / Down.

WHICH DIMENSION GOES WHERE
- "cc" is a printed dimension spanning exactly that leg, point to point. Several parallel dimension lines are common: the one nearest the pipe usually spans the shortest stretch (e.g. "23'-3 5/16"" wye to end), the outer one spans more (e.g. "26'-2 1/2"" 45 to end, which is 23'-3 5/16" + 2'-11 3/16"). Give each leg the one that spans exactly it; put overall dimensions in drawing.notes.
- A rolled or sloped leg can show its parts: a vertical part ("1'-0 1/16"), a horizontal part ("11 15/16"") and the true length along the pipe ("1'-5""). The true length is the cc; the parts go in notes. Two equal parts (two "10 15/16"") belong to a 45° leg whose true length is printed separately ("1'-3 1/2"").
- A riser's vertical dimension (e.g. "3'-11 5/8"" from a cleanout top down to the 45, or "6'-0 7/8"" from a floor drain down to the 90) is the cc of that riser leg.
- A dimension along a lateral's branch from the wye point to the branch end ("2'-3 3/8"") is the cc of the branch leg.
- Only use takeout / branchTakeout / takeouts / laying when the sheet explicitly dimensions a fitting body (centre to end, end to end). Never invent them. Fitting sizes are NOT normally printed on these sheets: the app has the makers' sizes, so a missing fitting size is never "unreadable".

WELDS
- Joint numbers are usually handwritten in red circles with a leader line to an X on the pipe. Boxes "13WWD-FW" mark field welds (type "FW"). Follow each leader to its X.
- Record each joint at the point it is next to, and set "leg" to the leg it sits on (at a fitting with several legs). Where two fittings fuse straight together the X is between them on that short leg: use that leg.
- A joint at a "Cont on" end belongs to that end point.
- An "FW" box with no handwritten number next to it is normal (that joint is numbered on the next sheet): just leave it out. Faint numbers showing through from the sheet underneath are not on this sheet: ignore them, don't mention them.

UNREADABLE
- "unreadable" is only for things printed on THIS sheet that you could not make out (a blurred digit, a cut-off label). Not for things that aren't printed, not for drafting conventions, not for show-through, not for fitting sizes.

BILL OF MATERIALS
- Copy every row: item, size 1, size 2, description, qty exactly. The pipe quantity is a total length (25'-3 5/16"). Pipe size can differ from fitting sizes (4" pipe with a 6" x 4" reducer): give each fitting its own size.
- material: e.g. "6\" IPS SDR 11 HDPE PE4710". joining: butt_fusion for HDPE / polyethylene.

PHOTOS
- Several photos may show one sheet in parts (title block, BOM, the drawing area, close-ups of a fitting cluster). Combine them into one reading; things that appear in two photos are the same thing, never count them twice.
- drawing.number is the DRAWING NUMBER in the title block (e.g. ending -13). Also fill line (LINE NO.), pipeClass (PIPE CLASS), installSpec (INSTALL SPEC), rev, project and title when visible.

EXAMPLE of a correct reading of a similar sheet (cleanout riser, two 45s rolled down onto a 6" lateral wye, a long sloped run, a branch to the next sheet). Coordinates in this example are shifted, so never copy its values:
${EXAMPLE_READING}

Always answer by calling the record_isometric tool exactly once with everything you read. Do not answer in plain text.`;

export interface ImageIn {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string; // base64, no data: prefix
}

function photoBlocks(images: ImageIn[]): unknown[] {
  const n = images.length;
  return images.flatMap((im, i) => [
    ...(n > 1 ? [{type: 'text', text: `Photo ${i + 1} of ${n} (all of the same sheet)`}] : []),
    {type: 'image', source: {type: 'base64', media_type: im.mediaType, data: im.data}},
  ]);
}

const ONE_SHEET = (n: number) =>
  n > 1
    ? `These ${n} photos are all of ONE sheet, taken in parts: the drawing area, the title block, the bill of materials, close-ups. Put them together into ONE complete reading of the whole sheet: every point, leg, fitting, joint number and BOM row from every photo, each once. `
    : '';

export function buildRequest(images: ImageIn[], model = DEFAULT_MODEL, hint = '', extra?: string) {
  const content: unknown[] = photoBlocks(images);
  content.push({type: 'text', text: `${ONE_SHEET(images.length)}Read this isometric and record it.${hint ? `\nNotes from the fitter (follow them): ${hint}` : ''}${extra ? `\n\n${extra}` : ''}`});
  return {
    model,
    max_tokens: 32000,
    system: SYSTEM,
    tools: [SHEET_TOOL],
    // The newest models don't allow forcing a tool, so let Claude choose; the prompt asks for it.
    tool_choice: {type: 'auto'},
    messages: [{role: 'user', content}],
  };
}

export class ReadError extends Error {
  kind: 'key' | 'credit' | 'busy' | 'network' | 'refused' | 'bad';
  constructor(kind: ReadError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface ReadResult {
  sheet: Sheet;
  usage: {input: number; output: number};
  model: string;
}

/** Call the API from the browser with the user's own key. */
export async function readSheet(apiKey: string, images: ImageIn[], model = DEFAULT_MODEL, hint = '', signal?: AbortSignal, extra?: string): Promise<ReadResult> {
  let r: Response;
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(buildRequest(images, model, hint, extra)),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ReadError('network', 'Could not reach Claude. Check your connection.');
  }
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    /* handled below */
  }
  if (!r.ok) {
    const msg: string = body?.error?.message ?? `HTTP ${r.status}`;
    if (r.status === 401 || r.status === 403) throw new ReadError('key', `Your API key was not accepted (${msg}).`);
    if (r.status === 402 || /credit|billing/i.test(msg)) throw new ReadError('credit', `Your Anthropic account needs credit (${msg}).`);
    if (r.status === 429 || r.status === 529 || r.status >= 500) throw new ReadError('busy', `Claude is busy right now. Try again in a minute. (${msg})`);
    throw new ReadError('bad', msg);
  }
  const input = readingFrom(body);
  if (!input) {
    if (body?.stop_reason === 'max_tokens') throw new ReadError('bad', 'The reading was cut off (sheet too big). Try one photo of the whole sheet.');
    const said = body?.content?.find((c: any) => c.type === 'text')?.text;
    throw new ReadError('refused', said ? `Claude didn't return a reading: ${String(said).slice(0, 300)}` : "Claude didn't return a reading. Try again.");
  }
  return {sheet: normalizeSheet(input), usage: {input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0}, model: body.model ?? model};
}

/**
 * What looks wrong with a reading, judged by solving it: things that don't add up point at a
 * misread number, a missed fitting or a missed photo. Missing fitting sizes are not reading
 * problems (they come from the fitter's library), so they're left out.
 */
export function readingProblems(sheet: Sheet, settings?: Settings, library: TakeoutEntry[] = []): string[] {
  const sol = solve(sheet, settings, library);
  const out: string[] = [];
  // The parts list may have been worked out with another maker's fittings: if any maker's sizes
  // make it add up, the reading is fine.
  const someMakerFits = makerFits(sheet, settings ?? DEFAULT_SETTINGS).some(f => f.off !== null && Math.abs(f.off) <= 1 / 8);
  for (const c of sol.checks) {
    if (c.level !== 'error' && c.level !== 'warn') continue;
    if (/^Need the |Fusion allowance|Extra length|longer than a .* stick|^Couldn't read|^Using the /.test(c.text)) continue;
    if (someMakerFits && /^Pipe total .* vs BOM/.test(c.text)) continue;
    out.push(c.text);
  }
  for (const p of sol.pieces)
    if (p.cc === null) out.push(`Run ${p.leg} (${p.from} → ${p.to}) has no length: no dimension for it, and its ends can't be placed from coordinates and directions.`);
  if (!sheet.bom.length) out.push('No bill of materials was read.');
  if (!sheet.welds.length) out.push('No joint numbers were read.');
  if (sheet.legs.length === 0) out.push('No pipe runs were read.');
  return out;
}

/** A second look: the same photos, the first reading, and what didn't add up. */
export function checkPrompt(first: Sheet, problems: string[]): string {
  return `A first reading of these photos is below. A calculator worked out the cuts from it and found these problems:
${problems.map(p => `- ${p}`).join('\n')}

Look at every photo again carefully. Fix whatever was misread or missed (a digit, a fraction, a dimension given to the wrong run, a fitting, a joint number, a BOM row, something only in one of the photos). Keep everything that was right. If the drawing itself doesn't add up (a BOM total that doesn't match its own dimensions), keep what is printed and say so in drawing.notes. Then call record_isometric with the complete corrected reading of the whole sheet.

First reading:
${JSON.stringify(first)}`;
}

/** The reading: the tool call, or (if Claude answered in text instead) a JSON object in the text. */
export function readingFrom(body: any): any | null {
  const content: any[] = Array.isArray(body?.content) ? body.content : [];
  const call = content.find(c => c.type === 'tool_use' && c.name === SHEET_TOOL.name);
  if (call?.input && typeof call.input === 'object') return call.input;
  for (const c of content) {
    if (c.type !== 'text' || typeof c.text !== 'string') continue;
    const t = c.text.replace(/```(?:json)?/g, '');
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) continue;
    try {
      const o = JSON.parse(t.slice(a, b + 1));
      if (o && (Array.isArray(o.legs) || Array.isArray(o.points))) return o;
    } catch {
      /* not JSON */
    }
  }
  return null;
}

// ---- Cleaning up whatever came back so the rest of the app can trust the shape ------------------
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' && Number.isFinite(x) ? String(x) : null);
const num = (x: unknown): number | null => {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string') {
    const n = parseFloat(x.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const arr = (x: unknown): any[] => (Array.isArray(x) ? x.filter(v => v && typeof v === 'object') : []);

export function normalizeSheet(raw: any): Sheet {
  const d = raw?.drawing ?? {};
  const ids = new Set<string>();
  const uniq = (want: unknown, prefix: string, i: number) => {
    let id = str(want) ?? `${prefix}${i + 1}`;
    while (ids.has(id)) id = `${id}'`;
    ids.add(id);
    return id;
  };
  const points: Point[] = arr(raw?.points).map((p, i) => ({
    id: uniq(p.id, 'P', i),
    kind: p.kind === 'end' ? 'end' : 'center',
    e: num(p.e),
    n: num(p.n),
    el: num(p.el),
    label: str(p.label) ?? undefined,
    cont: str(p.cont) ?? undefined,
    next: typeof p.next === 'string' && p.next in FITTING_NAME && p.next !== 'other' ? (p.next as Point['next']) : undefined,
  }));
  const pids = new Set(points.map(p => p.id));
  const legs: Leg[] = arr(raw?.legs)
    .map((l, i) => ({
      id: uniq(l.id, 'L', i),
      from: str(l.from) ?? '',
      to: str(l.to) ?? '',
      direction: str(l.direction),
      cc: str(l.cc),
      pipe: str(l.pipe),
      slope: str(l.slope),
      bomItem: num(l.bomItem),
    }))
    .filter(l => l.from && l.to && l.from !== l.to);
  // A leg that points at a missing point gets that point added, so nothing is silently dropped.
  for (const l of legs)
    for (const p of [l.from, l.to])
      if (!pids.has(p)) {
        points.push({id: p, kind: 'end'});
        pids.add(p);
      }
  const lids = new Set(legs.map(l => l.id));
  const fittings: Fitting[] = arr(raw?.fittings).map((f, i) => {
    const takeouts: Record<string, string> = {};
    if (f.takeouts && typeof f.takeouts === 'object') for (const [k, val] of Object.entries(f.takeouts)) if (lids.has(k) && str(val)) takeouts[k] = str(val)!;
    return {
      id: uniq(f.id, 'F', i),
      type: FITTING_TYPES.includes(f.type) ? f.type : 'other',
      bomItem: num(f.bomItem),
      point: pids.has(str(f.point) ?? '') ? str(f.point) : null,
      inlineLeg: lids.has(str(f.inlineLeg) ?? '') ? str(f.inlineLeg) : null,
      inlineAt: f.inlineAt === 'to' ? 'to' : f.inlineAt === 'from' ? 'from' : null,
      angle: num(f.angle),
      size: str(f.size),
      takeout: str(f.takeout),
      branchTakeout: str(f.branchTakeout),
      branchLeg: lids.has(str(f.branchLeg) ?? '') ? str(f.branchLeg) : null,
      takeouts: Object.keys(takeouts).length ? takeouts : null,
      laying: str(f.laying),
      note: str(f.note),
    };
  });
  const welds: Weld[] = arr(raw?.welds)
    .map(w => ({number: str(w.number) ?? '', point: str(w.point) ?? '', leg: lids.has(str(w.leg) ?? '') ? str(w.leg) : null, type: str(w.type)}))
    .filter(w => w.number && pids.has(w.point));
  const bom: BomItem[] = arr(raw?.bom).map((b, i) => ({
    item: num(b.item) ?? i + 1,
    size1: str(b.size1),
    size2: str(b.size2),
    description: str(b.description) ?? '',
    qty: str(b.qty) ?? '',
    spec: str(b.spec),
  }));
  const joining: Joining = JOININGS.includes(raw?.joining) ? raw.joining : /HDPE|PE\s?\d{4}|POLYETH/i.test(String(raw?.material ?? '')) ? 'butt_fusion' : 'butt_weld';
  return {
    drawing: {
      number: str(d.number) ?? 'Unnamed sheet',
      rev: str(d.rev),
      title: str(d.title),
      project: str(d.project),
      line: str(d.line),
      pipeClass: str(d.pipeClass),
      installSpec: str(d.installSpec),
      notes: Array.isArray(d.notes) ? d.notes.map(str).filter(Boolean) as string[] : [],
    },
    size: str(raw?.size) ?? '',
    material: str(raw?.material) ?? '',
    joining,
    points,
    legs,
    fittings,
    welds,
    bom,
    unreadable: Array.isArray(raw?.unreadable) ? raw.unreadable.map(str).filter(Boolean) : [],
    confidence: ['high', 'medium', 'low'].includes(raw?.confidence) ? raw.confidence : 'medium',
  };
}
