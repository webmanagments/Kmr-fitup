// Reads an isometric photo with Claude (vision), straight from the phone with the user's own key.
// The model fills in a fixed structure (a forced tool call), copying numbers exactly as printed.
// The app does every calculation itself; the model only reads.
import type {Fitting, Joining, Leg, Point, Sheet, Weld, BomItem, FittingType} from './types.ts';

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

export const SYSTEM = `You read single-line piping isometric drawings (pipefitting / weld maps) for a fitter in the field.
Your output feeds a calculator that works out cut lengths, so exact reading matters more than anything else.

Rules:
- Copy every dimension, coordinate and elevation EXACTLY as printed. Never round, convert or guess. If a digit or fraction is unclear, put null and describe it in "unreadable".
- Coordinates (E, N, EL+) are in decimal feet. Dimensions are feet-inches (22'-11 1/4").
- Model the pipe as points joined by straight legs. A point is a fitting centre (where centrelines meet) or an end of the pipe on this sheet. Make a leg for every straight run, including short ones between two fittings.
- Directions come from the coordinates when printed, otherwise from the north arrow on the drawing. Vertical runs are Up or Down.
- Put a printed dimension on a leg as "cc" only if it spans exactly that leg. A dimension that spans a fitting body (for example a lateral wye's centre-to-end) belongs in that fitting's takeout / branchTakeout / takeouts. A dimension that spans several legs: mention it in drawing.notes.
- Weld numbers are usually handwritten in circles with a leader line pointing at the joint; match each to the point and, at a fitting, the leg whose pipe end it is on.
- Copy the bill of materials row by row. The pipe quantity is a length.
- Set joining to butt_fusion for HDPE / polyethylene.
Always answer by calling the record_isometric tool exactly once with everything you read. Do not answer in plain text.`;

export interface ImageIn {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string; // base64, no data: prefix
}

export function buildRequest(images: ImageIn[], model = DEFAULT_MODEL, hint = '') {
  const content: unknown[] = images.map(im => ({type: 'image', source: {type: 'base64', media_type: im.mediaType, data: im.data}}));
  const many = images.length > 1 ? `These ${images.length} photos are all of the same sheet (the first is the whole sheet, the rest are close-ups). ` : '';
  content.push({type: 'text', text: `${many}Read this isometric and record it.${hint ? `\nNotes from the fitter (follow them): ${hint}` : ''}`});
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
export async function readSheet(apiKey: string, images: ImageIn[], model = DEFAULT_MODEL, hint = '', signal?: AbortSignal): Promise<ReadResult> {
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
      body: JSON.stringify(buildRequest(images, model, hint)),
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
