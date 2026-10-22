// Sample sheets: three typical 6" SDR 11 HDPE underground drain isometrics (names and coordinates
// made generic), plus a simple worked example. They are the demo jobs in the app and the test fixtures.
import type {Sheet} from './types.ts';

const common = {
  rev: '0',
  title: 'Underground drain (sample)',
  project: 'Sample job',
  line: 'DEMO-L-0001',
  pipeClass: 'HDPE-11',
  installSpec: null,
  notes: ['All dimensions are in feet-inch whereas elevations are in feet. Elevation callouts are to the centreline of pipe unless otherwise noted.'],
};
const HDPE = '6" IPS SDR 11 HDPE PE4710';
const PIPE = 'IPS SDR 11 HDPE PIPE, PE4710, ASTM D3350, ASTM F714';
const WYE = 'IPS SDR 11 45 DEG MOLDED LATERAL WYE, PE4710, ASTM D3350, ASTM D3261';
const ELL45 = 'IPS SDR 11 MOLDED 45 ELL, FUSION WELD, PE4710, ASTM D3350, ASTM D3261';
const ELL90 = 'IPS SDR 11 MOLDED 90 ELL, FUSION WELD, PE4710, ASTM D3350, ASTM D3261';

/** Sheet -3: a lateral wye on the main, the -6 branch fused straight onto it. Pipe 19'-1 9/16" (the BOM). */
export const SHEET_3: Sheet = {
  drawing: {...common, number: 'DEMO-ISO-3'},
  size: '6"',
  material: HDPE,
  joining: 'butt_fusion',
  points: [
    {id: 'A', kind: 'end', e: 1083.64, n: 1221.7, el: 351.95, label: 'Cont. on -2', cont: 'DEMO-ISO-2'},
    {id: 'W', kind: 'center', el: 351.94, label: 'Lateral wye'},
    {id: 'B', kind: 'end', e: 1084.25, n: 1223.31, el: 351.95, label: 'Cont. on -6', cont: 'DEMO-ISO-6'},
    {id: 'C', kind: 'end', e: 1105.64, n: 1221.7, el: 351.84, label: 'Cont. on -4', cont: 'DEMO-ISO-4'},
  ],
  legs: [
    {id: 'L1', from: 'A', to: 'W', direction: 'E', cc: `2'-2 11/16"`},
    {id: 'L2', from: 'W', to: 'C', direction: 'E', cc: `19'-9 5/16"`, slope: '0.5%', bomItem: 1},
    {id: 'L3', from: 'W', to: 'B', direction: 'N45W', cc: `2'-3 3/8"`},
  ],
  fittings: [{id: 'F1', type: 'lateral', bomItem: 2, point: 'W', angle: 45, size: '6" x 6"', branchLeg: 'L3', note: 'Overall run 22\'-0" from the -2 end to the -4 end.'}],
  welds: [
    {number: '1145', point: 'A', type: 'FW'},
    {number: '1146', point: 'B', type: 'FW'},
    {number: '1147', point: 'C', type: 'FW'},
  ],
  bom: [
    {item: 1, size1: '6"', description: PIPE, qty: `19'-1 9/16"`, spec: null},
    {item: 2, size1: '6"', size2: '6"', description: WYE, qty: '1', spec: null},
  ],
  confidence: 'high',
};

/** Sheet -6: a drop from a drain, a 90, a long sloped run and a 45 into the -3 wye. */
export const SHEET_6: Sheet = {
  drawing: {...common, number: 'DEMO-ISO-6'},
  size: '6"',
  material: HDPE,
  joining: 'butt_fusion',
  points: [
    {id: 'T', kind: 'end', e: 1083.75, n: 1246.75, el: 357.67, label: 'Floor drain'},
    {id: 'E1', kind: 'center', el: 352.07},
    {id: 'E2', kind: 'center', el: 351.96},
    {id: 'B', kind: 'end', e: 1084.25, n: 1223.31, el: 351.95, label: 'Cont. on -3', cont: 'DEMO-ISO-3'},
  ],
  legs: [
    {id: 'L1', from: 'T', to: 'E1', direction: 'Down', bomItem: 1},
    {id: 'L2', from: 'E1', to: 'E2', direction: 'S', cc: `22'-11 1/4"`, slope: '0.5%', bomItem: 1},
    {id: 'L3', from: 'E2', to: 'B', direction: 'S45E', cc: '8 1/2"'},
  ],
  fittings: [
    {id: 'F1', type: 'elbow90', bomItem: 2, point: 'E1', size: '6"'},
    {id: 'F2', type: 'elbow45', bomItem: 3, point: 'E2', size: '6"'},
  ],
  welds: [
    {number: '1157', point: 'E1', leg: 'L1', type: 'FW'},
    {number: '1158', point: 'E1', leg: 'L2', type: 'FW'},
    {number: '1159', point: 'E2', leg: 'L2', type: 'FW'},
  ],
  bom: [
    {item: 1, size1: '6"', description: PIPE, qty: `26'-4 11/16"`, spec: null},
    {item: 2, size1: '6"', description: ELL90, qty: '1', spec: null},
    {item: 3, size1: '6"', description: ELL45, qty: '1', spec: null},
  ],
  confidence: 'high',
};

/** Sheet -2: a cleanout riser, a 45 offset, a long run and a lateral wye taking the -1 branch. */
export const SHEET_2: Sheet = {
  drawing: {...common, number: 'DEMO-ISO-2'},
  size: '6"',
  material: HDPE,
  joining: 'butt_fusion',
  points: [
    {id: 'CO', kind: 'end', e: 1038.45, n: 1221.7, el: 357, label: 'Cleanout'},
    {id: 'E1', kind: 'center', el: 353.18},
    {id: 'E2', kind: 'center', el: 352.18},
    {id: 'W', kind: 'center', el: 352.05, label: 'Lateral wye'},
    {id: 'B', kind: 'end', e: 1062.75, n: 1223.31, el: 352.06, label: 'Cont. on -1', cont: 'DEMO-ISO-1'},
    {id: 'C', kind: 'end', e: 1083.64, n: 1221.7, el: 351.95, label: 'Cont. on -3', cont: 'DEMO-ISO-3'},
  ],
  legs: [
    {id: 'L1', from: 'CO', to: 'E1', direction: 'Down', bomItem: 1},
    {id: 'L2', from: 'E1', to: 'E2', direction: 'E 45 Down', bomItem: 1},
    {id: 'L3', from: 'E2', to: 'W', direction: 'E', slope: '0.5%', bomItem: 1},
    {id: 'L4', from: 'W', to: 'C', direction: 'E', cc: `19'-3 3/8"`, slope: '0.5%', bomItem: 1},
    {id: 'L5', from: 'W', to: 'B', direction: 'N45W', cc: `2'-3 3/8"`},
  ],
  fittings: [
    {id: 'F1', type: 'cleanout', bomItem: 4, point: null, inlineLeg: 'L1', inlineAt: 'from', size: '6"', note: 'See typical details'},
    {id: 'F2', type: 'elbow45', bomItem: 3, point: 'E1', size: '6"'},
    {id: 'F3', type: 'elbow45', bomItem: 3, point: 'E2', size: '6"'},
    {id: 'F4', type: 'lateral', bomItem: 2, point: 'W', angle: 45, size: '6" x 6"', branchLeg: 'L5'},
  ],
  welds: [
    {number: '1138', point: 'E1', leg: 'L1', type: 'FW'},
    {number: '1139', point: 'E1', leg: 'L2', type: 'FW'},
    {number: '1140', point: 'E2', leg: 'L3', type: 'FW'},
    {number: '1141', point: 'W', leg: 'L3', type: 'FW'},
    {number: '1142', point: 'B', type: 'FW'},
    {number: '1143', point: 'W', leg: 'L4', type: 'FW'},
    {number: '1144', point: 'C', type: 'FW'},
  ],
  bom: [
    {item: 1, size1: '6"', description: PIPE, qty: `43'-1 5/16"`, spec: null},
    {item: 2, size1: '6"', size2: '6"', description: WYE, qty: '1', spec: null},
    {item: 3, size1: '6"', description: ELL45, qty: '2', spec: null},
    {item: 4, size1: '6"', description: 'Cleanout - See Typical Details', qty: '1', spec: null},
  ],
  unreadable: ['The small dimensions on the cleanout riser and the 45 offset (photo too small); the riser and offset are placed from their elevations.'],
  confidence: 'medium',
};

const common2 = {...common, line: 'DEMO-L-0002'};
const REDUCER = 'IPS SDR 11 CONCENTRIC REDUCER, FUSION WELD, PE4710, ASTM D3350, ASTM D3261';

/**
 * Sheet -13: a cleanout riser, a rolled 45 offset fused straight onto a lateral wye, and a long
 * sloped run. Every fitting fuses to the next with no pipe between, so only two pipes are cut:
 * 2'-0" up the riser and 23'-3 5/16" along the run (25'-3 5/16" total, the BOM figure).
 */
export const SHEET_13: Sheet = {
  drawing: {...common2, number: 'DEMO-ISO-13'},
  size: '6"',
  material: HDPE,
  joining: 'butt_fusion',
  points: [
    {id: 'CO', kind: 'end', e: 744.56, n: 1219.8, el: 357, label: 'Cleanout CO1'},
    {id: 'E1', kind: 'center', el: 353.03},
    {id: 'E2', kind: 'center', el: 352.02},
    {id: 'W', kind: 'center', el: 352.01, label: 'Lateral wye'},
    {id: 'B', kind: 'end', e: 742.25, n: 1221.41, el: 352.02, label: 'Cont. on -14', cont: 'DEMO-ISO-14'},
    {id: 'A', kind: 'end', e: 717.36, n: 1219.8, el: 351.88, label: 'Cont. on -12', cont: 'DEMO-ISO-12'},
  ],
  legs: [
    {id: 'L1', from: 'CO', to: 'E1', direction: 'Down', cc: `3'-11 5/8"`, bomItem: 1},
    {id: 'L2', from: 'E1', to: 'E2', direction: 'W 45 Down', cc: `1'-5"`},
    {id: 'L3', from: 'E2', to: 'W', direction: 'W', cc: `2'-11 3/16"`},
    {id: 'L4', from: 'W', to: 'A', direction: 'W', cc: `23'-3 5/16"`, slope: '0.5%', bomItem: 1},
    {id: 'L5', from: 'W', to: 'B', direction: 'N45E', cc: `2'-3 3/8"`},
  ],
  fittings: [
    {id: 'F1', type: 'cleanout', bomItem: 4, inlineLeg: 'L1', inlineAt: 'from', size: '6"', note: 'Cleanout CO1, see typical details'},
    {id: 'F2', type: 'elbow45', bomItem: 3, point: 'E1', size: '6"'},
    {id: 'F3', type: 'elbow45', bomItem: 3, point: 'E2', size: '6"'},
    {id: 'F4', type: 'lateral', bomItem: 2, point: 'W', angle: 45, size: '6" x 6"', branchLeg: 'L5'},
  ],
  welds: [
    {number: '1468', point: 'A', type: 'FW'},
    {number: '1469', point: 'W', leg: 'L4', type: 'FW'},
    {number: '1470', point: 'B', type: 'FW'},
    {number: '1471', point: 'W', leg: 'L3', type: 'FW'},
    {number: '1472', point: 'E1', leg: 'L2', type: 'FW'},
    {number: '1473', point: 'E1', leg: 'L1', type: 'FW'},
  ],
  bom: [
    {item: 1, size1: '6"', description: PIPE, qty: `25'-3 5/16"`, spec: null},
    {item: 2, size1: '6"', size2: '6"', description: WYE, qty: '1', spec: null},
    {item: 3, size1: '6"', description: ELL45, qty: '2', spec: null},
    {item: 4, size1: '6"', description: 'Cleanout - See Typical Details', qty: '1', spec: null},
  ],
  confidence: 'high',
};

/**
 * Sheet -11 (4"): a drop from a floor drain, a 90, a long sloped run, then a 45 fused straight onto
 * a 6" x 4" reducer at the sheet break. Pipe: 5'-6 1/2" + 18'-7 1/2" = 24'-2" (the BOM figure).
 */
export const SHEET_11: Sheet = {
  drawing: {...common2, number: 'DEMO-ISO-11'},
  size: '4"',
  material: '4" IPS SDR 11 HDPE PE4710',
  joining: 'butt_fusion',
  points: [
    {id: 'T', kind: 'end', e: 644.25, n: 1242, el: 357.67, label: 'Floor drain BU TYPE A'},
    {id: 'E1', kind: 'center', el: 351.6},
    {id: 'E2', kind: 'center', el: 351.5},
    {id: 'A', kind: 'end', e: 643.34, n: 1221.41, el: 351.5, label: 'Cont. on -10', cont: 'DEMO-ISO-10'},
  ],
  legs: [
    {id: 'L1', from: 'T', to: 'E1', direction: 'Down', cc: `6'-0 7/8"`, bomItem: 1},
    {id: 'L2', from: 'E1', to: 'E2', direction: 'S', cc: `19'-8 1/8"`, slope: '0.5%', bomItem: 1},
    {id: 'L3', from: 'E2', to: 'A', direction: 'S45W', cc: `1'-3 1/2"`},
  ],
  fittings: [
    {id: 'F1', type: 'elbow90', bomItem: 3, point: 'E1', size: '4"'},
    {id: 'F2', type: 'elbow45', bomItem: 4, point: 'E2', size: '4"'},
    {id: 'F3', type: 'reducer', bomItem: 2, inlineLeg: 'L3', inlineAt: 'to', size: '6" x 4"', note: 'Concentric, 6" end at the sheet break'},
  ],
  welds: [
    {number: '1464', point: 'E1', leg: 'L1', type: 'FW'},
    {number: '1463', point: 'E1', leg: 'L2', type: 'FW'},
    {number: '1462', point: 'E2', leg: 'L2', type: 'FW'},
    {number: '1461', point: 'E2', leg: 'L3', type: 'FW'},
  ],
  bom: [
    {item: 1, size1: '4"', description: PIPE, qty: `24'-2"`, spec: null},
    {item: 2, size1: '6"', size2: '4"', description: REDUCER, qty: '1', spec: null},
    {item: 3, size1: '4"', description: ELL90, qty: '1', spec: null},
    {item: 4, size1: '4"', description: ELL45, qty: '1', spec: null},
  ],
  confidence: 'high',
};

/**
 * Sheet 10WWD -3 (6"): a 68'-6" run with two laterals taking branches from the next sheets, and a
 * field joint where one full 40' stick ends. Pipe: 16'-2 7/8" + 40'-0" + 6'-6 3/16" = 62'-9 1/16"
 * (the BOM figure).
 */
export const SHEET_3B: Sheet = {
  drawing: {...common2, number: 'DEMO-ISO-23'},
  size: '6"',
  material: HDPE,
  joining: 'butt_fusion',
  points: [
    {id: 'C', kind: 'end', e: 571.15, n: 1064.69, el: 351.49, label: 'Cont. on -2', cont: 'DEMO-ISO-22'},
    {id: 'W2', kind: 'center', el: 351.48, label: 'Lateral wye'},
    {id: 'B2', kind: 'end', e: 572.76, n: 1065.3, el: 351.49, label: 'Cont. on -5', cont: 'DEMO-ISO-25'},
    {id: 'W1', kind: 'center', el: 351.39, label: 'Lateral wye'},
    {id: 'B1', kind: 'end', e: 572.76, n: 1084.41, el: 351.39, label: 'Cont. on -9', cont: 'DEMO-ISO-29'},
    {id: 'J', kind: 'center', label: 'Joint'},
    {id: 'A', kind: 'end', e: 571.15, n: 1133.19, el: 351.15, label: 'Cont. on -4', cont: 'DEMO-ISO-24'},
  ],
  legs: [
    {id: 'L1', from: 'C', to: 'W2', direction: 'N', cc: `2'-2 11/16"`},
    {id: 'L2', from: 'W2', to: 'W1', direction: 'N', cc: `19'-1 5/16"`, slope: '0.5%', bomItem: 1},
    {id: 'L3', from: 'W1', to: 'J', direction: 'N', cc: `40'-7 3/4"`, slope: '0.5%', bomItem: 1},
    {id: 'L4', from: 'J', to: 'A', direction: 'N', cc: `6'-6 3/16"`, slope: '0.5%', bomItem: 1},
    {id: 'L5', from: 'W2', to: 'B2', direction: 'E 45 S 0.21 Up', cc: `2'-3 3/8"`},
    {id: 'L6', from: 'W1', to: 'B1', direction: 'S 45 E 0.098 Up', cc: `2'-3 3/8"`},
  ],
  fittings: [
    {id: 'F1', type: 'lateral', bomItem: 2, point: 'W2', angle: 45, size: '6" x 6"', branchLeg: 'L5'},
    {id: 'F2', type: 'lateral', bomItem: 2, point: 'W1', angle: 45, size: '6" x 6"', branchLeg: 'L6'},
  ],
  welds: [
    {number: '1614', point: 'A', type: 'FW'},
    {number: '1615', point: 'J', type: 'FW'},
    {number: '1616', point: 'B1', type: 'FW'},
    {number: '1617', point: 'W1', leg: 'L3', type: 'FW'},
    {number: '1618', point: 'W1', leg: 'L2', type: 'FW'},
    {number: '1619', point: 'W2', leg: 'L2', type: 'FW'},
    {number: '1620', point: 'B2', type: 'FW'},
  ],
  bom: [
    {item: 1, size1: '6"', description: PIPE, qty: `62'-9 1/16"`, spec: null},
    {item: 2, size1: '6"', size2: '6"', description: WYE, qty: '2', spec: null},
  ],
  confidence: 'high',
};

/** The worked example: a 50' run between two 90s that take out 5" each, rising 8'-2" at the end. */
export const EXAMPLE: Sheet = {
  drawing: {number: 'EXAMPLE-1', title: 'Worked example: 50\' run, two 90s', notes: ['Not a real drawing.']},
  size: '6"',
  material: HDPE,
  joining: 'butt_fusion',
  points: [
    {id: 'S', kind: 'end', e: 0, n: 0, el: 100, label: 'Start'},
    {id: 'E1', kind: 'center'},
    {id: 'E2', kind: 'center'},
    {id: 'T', kind: 'end', label: 'Top'},
  ],
  legs: [
    {id: 'L1', from: 'S', to: 'E1', direction: 'N', cc: `10'-0"`},
    {id: 'L2', from: 'E1', to: 'E2', direction: 'E', cc: `50'-0"`},
    {id: 'L3', from: 'E2', to: 'T', direction: 'Up', cc: `8'-2"`},
  ],
  fittings: [
    {id: 'F1', type: 'elbow90', point: 'E1', size: '6"', takeout: '5"'},
    {id: 'F2', type: 'elbow90', point: 'E2', size: '6"', takeout: '5"'},
  ],
  welds: [
    {number: '1', point: 'E1', leg: 'L1'},
    {number: '2', point: 'E1', leg: 'L2'},
    {number: '3', point: 'E2', leg: 'L2'},
    {number: '4', point: 'E2', leg: 'L3'},
  ],
  bom: [{item: 1, size1: '6"', description: 'PIPE', qty: `66'-6"`}],
  confidence: 'high',
};

export const SAMPLES: Sheet[] = [SHEET_13, SHEET_11, SHEET_6, SHEET_3B, SHEET_3, SHEET_2, EXAMPLE];
