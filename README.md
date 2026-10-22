# KMR FitUp

Pipe isometrics on your Meta Ray-Ban Display glasses: photograph a single-line weld isometric on
your phone, Claude reads it, and the glasses show the finished spool in 3D with exact cut lengths,
take-outs and a weld map you can tick off as you go.

- **Glasses:** `https://webmanagments.github.io/Kmr-fitup/`
- **Phone scanner:** `https://webmanagments.github.io/Kmr-fitup/scan.html`

## How it works

1. Open FitUp on the glasses. The home screen shows an 8-character pairing code.
2. On the phone, open the scanner, enter the code and your Anthropic API key (Setup).
3. Take a photo of the sheet (plus close-ups of small numbers if you like) and tap **Read it with Claude**.
4. Check what was read. Every number can be fixed, and the cut list updates as you type.
5. **Send to glasses.** The sheet is encrypted with the pairing code and lands on the glasses in a few seconds.

On the glasses: swipe left/right on the 3D view to step through pipes and fittings, swipe down to
change the view, pinch for the full maths. The tabs hold the cut list (pinch = cut), the joints
(pinch = fused), checks (pinch a missing take-out to set it) and the drawing.

## The maths

```
cut = centre-to-centre − take-out at each end − in-line fitting bodies
      + fusion allowance per fused end (HDPE)    or    − root gap per weld (steel)
```

Rounded to the nearest 1/16". Take-outs come from the drawing first, then your own library
(phone Setup, or set on the glasses), then ASME B16.9 long-radius sizes for steel. HDPE molded
fittings vary by maker, so FitUp never guesses them: it asks, and if only one is missing it
suggests the value that makes the pipe add up to the BOM total. Every result is cross-checked
against printed pipe lengths, coordinates and the bill of materials.

## Database rules

Sheets travel through the same Firebase Realtime Database as the other KMR apps, under `fitup/`,
end-to-end encrypted. The rules are in the `kmr` repo (`firebase-rules.json`).

## Development

```
npm run build      # type-check and build to docs/
npm test           # solver, units, pairing and reader tests
npm run flow       # D-pad walkthrough of the glasses app and the phone page (Playwright)
```
