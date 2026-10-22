// Dev-only: a stand-in for the Firebase Realtime Database REST API with the same "fitup" rules
// as firebase-rules.json. Usage: node tools/mock-db.mjs [port]  (then set localStorage
// 'kmr.dbOverride' to http://127.0.0.1:<port>)
import http from 'node:http';

const port = Number(process.argv[2] ?? 9299);
const MAX_CT = 400000;
const NO_FITUP = process.env.NO_FITUP === '1'; // act like a database without the new rules
const db = {fitup: {}};
const BOX = /^[0-9a-f]{32}$/;
const JOB = /^[a-z0-9]{6,24}$/;

function ok(box, job, val, now) {
  if (NO_FITUP) return 'no rules';
  if (!BOX.test(box) || !JOB.test(job)) return 'bad path';
  if (val === null) return null; // delete is always allowed
  if (db.fitup[box]?.[job]) return 'exists';
  if (!val || typeof val !== 'object') return 'bad value';
  for (const k of Object.keys(val)) if (!['iv', 'ct', 't', 'z'].includes(k)) return `extra ${k}`;
  if (typeof val.iv !== 'string' || val.iv.length > 32) return 'bad iv';
  if (typeof val.ct !== 'string' || val.ct.length > MAX_CT) return 'bad ct';
  if (val.t !== now) return 'bad t';
  if ('z' in val && val.z !== 1) return 'bad z';
  return null;
}
const sv = (v, now) => (v && typeof v === 'object' ? (v['.sv'] === 'timestamp' ? now : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x, now)]))) : v);

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/|\.json$/g, '');
      const parts = path.split('/').filter(Boolean);
      const now = Date.now();
      const deny = why => {
        res.statusCode = 401;
        res.end(JSON.stringify({error: `Permission denied (${why})`}));
      };
      if (parts[0] !== 'fitup' || NO_FITUP) return deny('path');
      const [, box, job] = parts;
      if (req.method === 'GET') {
        if (!box || !BOX.test(box) || job) return deny('read');
        return res.end(JSON.stringify(db.fitup[box] ?? null));
      }
      const val = body ? sv(JSON.parse(body), now) : null;
      let writes;
      if (req.method === 'PUT' && box && job) writes = {[job]: val};
      else if (req.method === 'DELETE' && box && job) writes = {[job]: null};
      else if (req.method === 'PATCH' && box && !job) writes = val;
      else return deny('method');
      for (const [j, v] of Object.entries(writes)) {
        const why = ok(box, j, v, now);
        if (why) return deny(why);
      }
      db.fitup[box] ??= {};
      for (const [j, v] of Object.entries(writes)) (v === null ? delete db.fitup[box][j] : (db.fitup[box][j] = v));
      if (!Object.keys(db.fitup[box]).length) delete db.fitup[box];
      res.end(JSON.stringify(val));
    });
  })
  .listen(port, () => console.log(`mock fitup db on http://127.0.0.1:${port}`));
