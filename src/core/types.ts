// The data read off one isometric sheet (by the AI, or typed/fixed by hand).
//
// A sheet is a small network:
//   points  — places on the pipe centreline: fitting centres (elbows, tees, wyes) or ends
//             (continuation to another sheet, an equipment nozzle, a drain hub…). Points may
//             carry printed coordinates (East / North / Elevation, in feet).
//   legs    — straight centreline runs between two points. A leg holds one pipe piece, plus any
//             in-line fittings sitting at its ends (a wye's run, a coupling, a valve).
//   fittings, welds and the bill of materials as printed.
//
// Lengths are kept exactly as printed ("22'-11 1/4\"") and parsed by the app, so nothing is
// silently rounded or re-typed by the reader.

export type FittingType =
  | 'elbow90'
  | 'elbow45'
  | 'elbow22'
  | 'elbow11'
  | 'tee'
  | 'lateral' // 45° lateral wye
  | 'reducer'
  | 'coupling'
  | 'flange'
  | 'valve'
  | 'cap'
  | 'cleanout'
  | 'other';

export type Joining = 'butt_fusion' | 'butt_weld' | 'socket_weld' | 'threaded' | 'other';

export interface Point {
  id: string;
  kind: 'center' | 'end';
  e?: number | null; // East, ft
  n?: number | null; // North, ft
  el?: number | null; // Elevation, ft
  label?: string; // "Cont. on …-6", "BU-2301E TYPE A"
  cont?: string; // drawing number this end continues on
  next?: FittingType | null; // the next sheet's first fitting, drawn dashed just past this end
}

export interface Fitting {
  id: string;
  type: FittingType;
  bomItem?: number | null;
  point?: string | null; // centre point (elbows, tees, wyes at a corner)
  inlineLeg?: string | null; // or sitting in-line on this leg…
  inlineAt?: 'from' | 'to' | null; // …at this end of it
  angle?: number | null;
  size?: string | null; // "6\"" (or "6\" x 4\"")
  takeout?: string | null; // printed centre-to-end (run ports)
  branchTakeout?: string | null; // printed centre-to-end of the branch port
  branchLeg?: string | null; // which leg is the branch (tees, wyes)
  takeouts?: Record<string, string> | null; // printed centre-to-end per leg id, when the ports differ (laterals)
  laying?: string | null; // printed end-to-end length of an in-line fitting
  note?: string | null;
}

export interface Leg {
  id: string;
  from: string;
  to: string;
  direction?: string | null; // N, S, E, W, NE, Up, Down, "S45E", "S 45 E 0.29 Down"…
  cc?: string | null; // printed centre-to-centre (or point-to-point) dimension
  pipe?: string | null; // printed pipe length, when the sheet shows one
  slope?: string | null; // "0.5%"
  bomItem?: number | null;
}

export interface Weld {
  number: string; // the weld map number (handwritten or printed), e.g. "1145"
  point: string; // where it is
  leg?: string | null; // which leg's pipe end it joins (when a point has several)
  type?: string | null; // "FW" field weld / fusion…
}

export interface BomItem {
  item: number;
  size1?: string | null;
  size2?: string | null;
  description: string;
  qty: string;
  spec?: string | null;
}

export interface Sheet {
  drawing: {
    number: string;
    rev?: string | null;
    title?: string | null;
    project?: string | null;
    line?: string | null;
    pipeClass?: string | null;
    installSpec?: string | null;
    notes?: string[];
  };
  size: string; // main pipe size, e.g. "6\""
  material: string; // "6\" IPS SDR 11 HDPE PE4710"
  joining: Joining;
  points: Point[];
  legs: Leg[];
  fittings: Fitting[];
  welds: Weld[];
  bom: BomItem[];
  unreadable?: string[]; // things the reader could not make out
  confidence?: 'high' | 'medium' | 'low';
}

export const FITTING_NAME: Record<FittingType, string> = {
  elbow90: '90° elbow',
  elbow45: '45° elbow',
  elbow22: '22½° elbow',
  elbow11: '11¼° elbow',
  tee: 'Tee',
  lateral: '45° lateral wye',
  reducer: 'Reducer',
  coupling: 'Coupling',
  flange: 'Flange',
  valve: 'Valve',
  cap: 'Cap',
  cleanout: 'Cleanout',
  other: 'Fitting',
};

export const JOINING_NAME: Record<Joining, string> = {
  butt_fusion: 'HDPE butt fusion',
  butt_weld: 'Butt weld (steel)',
  socket_weld: 'Socket weld',
  threaded: 'Threaded',
  other: 'Other',
};
