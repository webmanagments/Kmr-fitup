// Popups (part details, value steppers, the drawing viewer) and the Back stack behind them.
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {dirOf, focusables, focusDefault} from '../lib/spatial.ts';
import {formatLength, roundTo} from '../core/units.ts';
import {useCapture} from './keys.ts';

const backStack: {current: () => void}[] = [];
/** Called by the app on Back: closes the newest popup. Returns true if one was closed. */
export function popBack(): boolean {
  const top = backStack[backStack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}
export const popupOpen = () => backStack.length > 0;

export function useBack(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const e = {current: () => ref.current()};
    backStack.push(e);
    return () => {
      const i = backStack.indexOf(e);
      if (i >= 0) backStack.splice(i, 1);
    };
  }, []);
}

export function Modal({title, onClose, children, wide}: {title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean}) {
  useBack(onClose);
  const box = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => focusDefault(box.current));
    return () => {
      const el = restore.current;
      requestAnimationFrame(() => {
        if (el && document.contains(el)) return el.focus({preventScroll: true});
        // The control that opened the popup is gone (a fixed row disappears): stay in the same
        // part of the screen rather than jumping (and so switching tabs).
        const body = document.querySelector<HTMLElement>('.tab-body');
        if (body && focusables(body).length) focusDefault(body);
        else focusDefault();
      });
    };
  }, []);
  return (
    <div className="modal-back">
      <div className={`modal ${wide ? 'wide' : ''}`} data-focus-scope="modal" ref={box} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Pick a length with swipes: up/down ±1/16", left/right ±1" (or bigStep). Pinch saves, Back cancels. */
export function Stepper({
  title,
  note,
  start,
  min = 0,
  max = 240,
  bigStep = 1,
  onSave,
  onClose,
}: {
  title: string;
  note?: ReactNode;
  start: number;
  min?: number;
  max?: number;
  bigStep?: number;
  onSave: (v: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(roundTo(start));
  const btn = useRef<HTMLButtonElement>(null);
  useCapture(e => {
    if (document.activeElement !== btn.current) return false;
    const d = dirOf(e);
    if (!d) return false;
    const step = d === 'up' ? 1 / 16 : d === 'down' ? -1 / 16 : d === 'right' ? bigStep : -bigStep;
    setVal(v => Math.min(max, Math.max(min, roundTo(v + step))));
    return true;
  });
  return (
    <Modal title={title} onClose={onClose}>
      <button
        ref={btn}
        className="stepper"
        data-autofocus
        onClick={() => {
          onSave(val);
          onClose();
        }}
      >
        <span className="stepper-arrows" aria-hidden="true">
          ▲<small>+1/16"</small>
        </span>
        <span className="stepper-row">
          <span className="stepper-side" aria-hidden="true">
            ◀ −{formatLength(bigStep)}
          </span>
          <b className="stepper-val">{formatLength(val)}</b>
          <span className="stepper-side" aria-hidden="true">
            +{formatLength(bigStep)} ▶
          </span>
        </span>
        <span className="stepper-arrows" aria-hidden="true">
          ▼<small>−1/16"</small>
        </span>
      </button>
      {note && <p className="modal-note">{note}</p>}
      <p className="modal-hint">Pinch to save · Back to cancel</p>
    </Modal>
  );
}
