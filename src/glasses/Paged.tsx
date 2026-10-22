// A list that shows a page of rows at a time. Swiping down off the last row turns the page,
// swiping up off the first row goes back a page, and left / right flip pages from any row, so
// nothing ever scrolls off the display.
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {dirOf, focusEl} from '../lib/spatial.ts';
import {useCapture} from './keys.ts';

interface Props<T> {
  items: T[];
  perPage: number;
  row: (item: T, index: number) => ReactNode; // must render a single <button>
  keyOf: (item: T) => string;
  empty?: ReactNode;
  className?: string;
  autofocus?: boolean;
  onPage?: (page: number) => void;
}

export default function Paged<T>({items, perPage, row, keyOf, empty, className, autofocus, onPage}: Props<T>) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const box = useRef<HTMLDivElement>(null);
  const want = useRef<'first' | 'last' | null>(null);
  const p = Math.min(page, pages - 1);
  const shown = items.slice(p * perPage, p * perPage + perPage);

  useEffect(() => {
    if (!want.current) return;
    const rows = box.current?.querySelectorAll<HTMLElement>('[data-row]');
    if (rows?.length) focusEl(want.current === 'first' ? rows[0] : rows[rows.length - 1]);
    want.current = null;
  }, [p]);
  useEffect(() => onPage?.(p), [p, onPage]);

  useCapture(e => {
    const dir = dirOf(e);
    const a = document.activeElement as HTMLElement | null;
    if (!dir || !a || !box.current?.contains(a) || !a.hasAttribute('data-row')) return false;
    const rows = [...box.current.querySelectorAll<HTMLElement>('[data-row]')];
    const i = rows.indexOf(a);
    // Rows are full width, so left / right are free to flip pages quickly.
    if ((dir === 'right' && p < pages - 1) || (dir === 'left' && p > 0)) {
      want.current = 'first';
      setPage(p + (dir === 'right' ? 1 : -1));
      return true;
    }
    if (dir === 'down' && i === rows.length - 1 && p < pages - 1) {
      want.current = 'first';
      setPage(p + 1);
      return true;
    }
    if (dir === 'up' && i === 0 && p > 0) {
      want.current = 'last';
      setPage(p - 1);
      return true;
    }
    return false;
  });

  if (!items.length) return <div className={`paged ${className ?? ''}`}>{empty}</div>;
  return (
    <div className={`paged ${className ?? ''}`} ref={box} data-page={p}>
      <div className="paged-rows">
        {shown.map((it, i) => (
          <div key={keyOf(it)} className="paged-row" data-first={autofocus && p === 0 && i === 0 ? '' : undefined}>
            {row(it, p * perPage + i)}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="pager" aria-hidden="true">
          {Array.from({length: pages}, (_, i) => (
            <span key={i} className={i === p ? 'on' : ''} />
          ))}
          <b>
            {p + 1}/{pages}
          </b>
        </div>
      )}
    </div>
  );
}
