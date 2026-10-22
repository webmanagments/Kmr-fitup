// The phone page: pair with the glasses, photograph a sheet, let Claude read it, check it, send it.
import {useEffect, useRef, useState} from 'react';
import {makeJob, shortName} from '../core/job.ts';
import {CODE_LEN, formatCode, normalizeCode, sendJob} from '../core/pair.ts';
import {readSheet, ReadError} from '../core/reader.ts';
import {SAMPLES} from '../core/samples.ts';
import type {Sheet} from '../core/types.ts';
import {forClaude, forGlasses, loadPhoto, type Photo} from './image.ts';
import {getPrefs, setPrefs, usePrefs} from './prefs.ts';
import Review from './Review.tsx';
import {KeyCard, LibraryCard, ShopCard} from './Setup.tsx';

type Busy = null | 'reading' | 'sending';

export default function App() {
  const p = usePrefs();
  const [tab, setTab] = useState<'scan' | 'setup'>(() => (getPrefs().apiKey ? 'scan' : 'setup'));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hint, setHint] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{kind: 'ok' | 'err' | 'info'; text: string} | null>(null);
  const [seconds, setSeconds] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const paired = normalizeCode(p.code).length === CODE_LEN;

  useEffect(() => {
    if (busy !== 'reading') return;
    setSeconds(0);
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const loaded: Photo[] = [];
    for (const f of [...files].slice(0, 4)) {
      try {
        loaded.push(await loadPhoto(f));
      } catch {
        setMsg({kind: 'err', text: `Couldn't open ${f.name}.`});
      }
    }
    setPhotos(ps => [...ps, ...loaded].slice(0, 4));
  };

  const read = async () => {
    if (!p.apiKey) {
      setTab('setup');
      setMsg({kind: 'err', text: 'Add your Anthropic API key first.'});
      return;
    }
    setBusy('reading');
    setMsg(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const images = [];
      for (const ph of photos) images.push(await forClaude(ph));
      const r = await readSheet(p.apiKey, images, p.model, hint, ctl.signal);
      const sp = getPrefs().spent;
      setPrefs({spent: {input: sp.input + r.usage.input, output: sp.output + r.usage.output, reads: sp.reads + 1}});
      setSheet(r.sheet);
      setMsg({kind: 'info', text: `Read ${shortName(r.sheet.drawing.number)}. Check the numbers below, then send it to your glasses.`});
    } catch (e) {
      if ((e as Error).name === 'AbortError') setMsg({kind: 'info', text: 'Stopped.'});
      else setMsg({kind: 'err', text: e instanceof ReadError ? e.message : `Something went wrong: ${(e as Error).message}`});
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const send = async () => {
    if (!sheet) return;
    if (!paired) {
      setMsg({kind: 'err', text: 'Enter the pairing code shown on your glasses first.'});
      return;
    }
    setBusy('sending');
    setMsg(null);
    try {
      const thumb = photos[0] ? await forGlasses(photos[0]).catch(() => null) : null;
      const job = makeJob(sheet, p.settings, p.library, thumb);
      const r = await sendJob(p.code, job);
      if (r.ok) {
        setMsg({kind: 'ok', text: `Sent ${job.name}. It shows up on your glasses in a few seconds.`});
        setPrefs({history: [{id: job.id, name: job.name, at: Date.now(), job: {...job, thumb: null}}, ...getPrefs().history.filter(h => h.name !== job.name)].slice(0, 12)});
      } else
        setMsg({
          kind: 'err',
          text:
            r.why === 'rules'
              ? 'The database refused it: the FitUp rules need adding in Firebase.'
              : r.why === 'tooBig'
                ? 'That sheet is too big to send.'
                : r.why === 'bad'
                  ? 'That pairing code looks wrong.'
                  : "Couldn't reach the internet. Try again.",
        });
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    for (const ph of photos) URL.revokeObjectURL(ph.url);
    setPhotos([]);
    setSheet(null);
    setHint('');
    setMsg(null);
    top.current?.scrollIntoView({behavior: 'smooth'});
  };

  return (
    <div className="phone" ref={top}>
      <header className="ph-head">
        <h1>
          KMR <b>FitUp</b>
        </h1>
        <nav className="seg">
          <button className={tab === 'scan' ? 'on' : ''} onClick={() => setTab('scan')}>
            Scan
          </button>
          <button className={tab === 'setup' ? 'on' : ''} onClick={() => setTab('setup')}>
            Setup
          </button>
        </nav>
      </header>

      {tab === 'setup' && (
        <>
          <PairCard />
          <KeyCard />
          <ShopCard />
          <LibraryCard />
          <button className="btn primary wide" onClick={() => setTab('scan')}>
            Done
          </button>
        </>
      )}

      {tab === 'scan' && (
        <>
          {!paired && <PairCard />}
          {paired && (
            <p className="paired">
              Glasses <b>{formatCode(normalizeCode(p.code))}</b>{' '}
              <button className="link-btn" onClick={() => setTab('setup')}>
                change
              </button>
            </p>
          )}

          {!sheet && (
            <div className="card">
              <h3>1. Photograph the sheet</h3>
              <p className="muted small">Flat, square-on and in good light, the whole sheet in frame. Add up to 3 close-ups of small numbers or the bill of materials.</p>
              <div className="photos">
                {photos.map(ph => (
                  <div className="ph" key={ph.id}>
                    <img src={ph.url} alt="" style={{transform: `rotate(${ph.rot}deg)`}} />
                    <div className="ph-tools">
                      <button aria-label="Rotate" onClick={() => setPhotos(ps => ps.map(x => (x.id === ph.id ? {...x, rot: (((x.rot + 90) % 360) as Photo['rot'])} : x)))}>
                        ⟳
                      </button>
                      <button aria-label="Remove" onClick={() => setPhotos(ps => ps.filter(x => x.id !== ph.id))}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn primary" onClick={() => camera.current?.click()} disabled={photos.length >= 4}>
                  Take photo
                </button>
                <button className="btn" onClick={() => gallery.current?.click()} disabled={photos.length >= 4}>
                  Choose photos
                </button>
              </div>
              <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
              <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={e => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
              {photos.length > 0 && (
                <>
                  <label>
                    Anything Claude should know? (optional)
                    <input value={hint} onChange={e => setHint(e.target.value)} placeholder="e.g. 6 inch HDPE, the 90s are long-sweep" />
                  </label>
                  {busy === 'reading' ? (
                    <div className="reading">
                      <span className="spin" aria-hidden="true" />
                      <span>
                        Reading the sheet… {seconds}s<small>usually 20–60 seconds</small>
                      </span>
                      <button className="btn" onClick={() => abort.current?.abort()}>
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button className="btn primary wide" onClick={() => void read()}>
                      2. Read it with Claude
                    </button>
                  )}
                </>
              )}
              <details className="fold">
                <summary>Or try a sample sheet</summary>
                <div className="samples">
                  {SAMPLES.map(s => (
                    <button
                      key={s.drawing.number}
                      className="btn"
                      onClick={() => {
                        setSheet(structuredClone(s));
                        setMsg({kind: 'info', text: 'Sample loaded. Try editing a number and watch the cuts change.'});
                      }}
                    >
                      {shortName(s.drawing.number)}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}

          {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

          {sheet && (
            <>
              <Review sheet={sheet} setSheet={setSheet} settings={p.settings} library={p.library} />
              <div className="sendbar">
                <button className="btn" onClick={reset}>
                  New sheet
                </button>
                <button className="btn primary" disabled={busy === 'sending'} onClick={() => void send()}>
                  {busy === 'sending' ? 'Sending…' : '3. Send to glasses'}
                </button>
              </div>
            </>
          )}

          {!sheet && p.history.length > 0 && (
            <div className="card">
              <h3>Sent recently</h3>
              <ul className="history">
                {p.history.map(h => (
                  <li key={h.id}>
                    <span>
                      <b>{h.name}</b>
                      <small>{new Date(h.at).toLocaleString()}</small>
                    </span>
                    <button
                      className="btn small"
                      onClick={() => {
                        setSheet(structuredClone(h.job.sheet));
                        setMsg({kind: 'info', text: `Opened ${h.name}. Send it again or change it first.`});
                      }}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PairCard() {
  const p = usePrefs();
  const code = normalizeCode(p.code);
  return (
    <div className="card">
      <h3>Pair with your glasses</h3>
      <p className="muted small">Open KMR FitUp on your glasses: the 8-character code is on the home screen.</p>
      <input
        className={`code-input ${code.length === CODE_LEN ? 'good' : ''}`}
        value={formatCode(code)}
        placeholder="XXXX-XXXX"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        onChange={e => setPrefs({code: normalizeCode(e.target.value)})}
        aria-label="Pairing code"
      />
    </div>
  );
}
