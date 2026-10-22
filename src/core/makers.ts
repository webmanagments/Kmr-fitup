// Which maker's fittings make a sheet add up to its own bill of materials? The designer drew the
// sheet with one maker's sizes; if the pipe total only works out with one of them, that's what
// the sheet expects on site.
import {BRANDS, builtIn, type Brand, type Settings, type TakeoutEntry} from './library.ts';
import {solve} from './solve.ts';
import type {Sheet} from './types.ts';

export interface MakerFit {
  brand: Brand;
  name: string;
  off: number | null; // pipe total minus BOM total, inches (null: can't tell)
}

export function makerFits(sheet: Sheet, settings: Settings): MakerFit[] {
  return (Object.keys(BRANDS) as Brand[]).map(brand => {
    const sol = solve(sheet, {...settings, brand}, [] as TakeoutEntry[]);
    const complete = sol.pieces.every(p => p.status === 'ok' || p.status === 'nopipe');
    // A maker with none of this sheet's fittings in its catalog is really the drawing's own sizes.
    const own = sol.fittings.filter(f => f.ports.length || f.fitting.inlineLeg).map(f => builtIn(f.fitting.type, sol.size ?? 6, sol.material, null, brand));
    const anyMaker = own.some(e => e?.id.startsWith(`${brand}-`));
    return {brand, name: anyMaker || !own.length ? BRANDS[brand] : "the drawing's own", off: complete && sol.bomPipe ? sol.totalNet - sol.bomPipe : null};
  });
}

/** A short line for the review screens, or null when there's nothing useful to say. */
export function makerLine(sheet: Sheet, settings: Settings, fmt: (n: number) => string): string | null {
  const fits = makerFits(sheet, settings).filter(f => f.off !== null);
  if (!fits.length) return null;
  const match = fits.filter(f => Math.abs(f.off!) <= 1 / 8);
  const others = fits.filter(f => !match.includes(f)).map(f => `${f.name} would be ${f.off! > 0 ? 'over' : 'under'} by ${fmt(Math.abs(f.off!))}`);
  if (match.length === 1) return `This sheet's parts list adds up with ${match[0].name} fittings${others.length ? ` (${others.join('; ')})` : ''}.`;
  if (match.length > 1) return `This sheet's parts list adds up with ${match.map(m => m.name).join(' or ')} fittings.`;
  return `No maker's fittings make this sheet add up to its parts list exactly: ${fits.map(f => `${f.name} ${f.off! > 0 ? '+' : '−'}${fmt(Math.abs(f.off!))}`).join(', ')}.`;
}
