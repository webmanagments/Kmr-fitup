// Several parts of a screen may want raw swipes at once (a paged list under a popup). The
// navigation library has one capture slot, so keep a stack here: the newest one asks first.
import {useEffect, useRef} from 'react';
import {setKeyCapture} from '../lib/spatial.ts';

type Capture = (e: KeyboardEvent) => boolean;
const stack: {current: Capture}[] = [];

setKeyCapture(e => {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].current(e)) return true;
  return false;
});

/** Claim swipes / pinches while this component is mounted. Return true to consume the key. */
export function useCapture(fn: Capture, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry = {current: (e: KeyboardEvent) => ref.current(e)};
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
