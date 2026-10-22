# KMR FitUp

Pipe isometrics on your Meta Ray-Ban Display glasses: photograph a single-line weld isometric on
your phone, Claude reads it, and the glasses show the finished spool in 3D with exact cut lengths,
take-outs and a weld map you can tick off as you go.

- **Glasses:** `https://webmanagments.github.io/Kmr-fitup/`
- **Phone scanner:** `https://webmanagments.github.io/Kmr-fitup/scan.html`

## How it works

1. Open FitUp on the glasses. The home screen shows an 8-character pairing code.
2. On the phone, open the scanner, enter the code and your Anthropic API key (Setup).
3. Tap **Live scan** and point the phone at the sheet. The phone checks every frame itself (steady,
   sharp, lit, sheet filling the view) and takes the picture the moment it's good, then Claude
   reads it. If Claude can't read something, tap **Live close-up**: it snaps a close-up the same
   way and reads the sheet again with both photos. (Take photo / Choose photos still work.)
4. Check what was read. Every number can be fixed, and the cut list updates as you type.
5. **Send to glasses.** The sheet is encrypted with the pairing code and lands on the glasses in a few seconds.

On the glasses: swipe left/right on the 3D view to step through pipes and fittings, swipe down to
change the view, pinch for the full maths. The tabs hold the cut list (pinch = cut), the joints
(pinch = fused), checks (pinch a missing take-out to set it) and the drawing.

## The maths

```
cut = centre-to-centre − take-out at each end − in-line fitting bodies
      + extra length (HDPE: once per pipe, or per fused end)    or    − root gap per weld (steel)
```

The extra length is set in Setup → Shop numbers (anything over 6" is treated as a typo and reset
to 3"). Where fittings fuse straight together there's no pipe to cut; at a wye branch that ends at
a sheet break, the next sheet's 45 goes straight on (drawn dashed in the 3D view). Between a
fitting and a sheet break, anything under 3" either way is not a pipe: your fitting is just a
little longer or shorter than the designer's, and the app says how far the next sheet shifts.

Rounded to the nearest 1/16". Take-outs come from the drawing first, then your own library
(phone Setup, or set on the glasses), then catalog values:

- **HDPE, by maker** (Setup → "Who made the HDPE fittings?"; sizes differ by up to ~2"):
  - *GF Central Plastics* (IPS & DIPS Industrial catalog): 2"–12" 90s, 45s and equal tees.
    6": 90 = 8 5/8", 45 = 8 1/2", tee = 9". 4": 90 = 6 3/8", 45 = 6 1/4".
  - *Integrifuse / Integrity Fusion* (the default: the fittings on site), product dimension sheets
    Rev. 072026-A: 2"–8" 90s, 45s, tees, lateral wyes, reducers and caps (+ flange adapters).
    6": 90 = 8 13/16", 45 = 6 7/16" (item 100013), tee = 9 1/16", wye (item 100906) = 2'-3 9/16"
    centre to heel, 6 3/16" to outlet, 2'-1 9/16" to branch.
  - If the chosen maker has no figure for a fitting, the other maker's is used and flagged.
  - The app also says which maker's sizes make each sheet add up to its own parts list (the B&V
    sheets add up with GF to the 1/16").
- **Steel:** ASME B16.9 long-radius.

If only one take-out is missing, FitUp suggests the value that makes the pipe add up to the BOM
total. Every result is cross-checked against printed pipe lengths, coordinates and the BOM.

## Calculator

The glasses (home → Calc) and the phone (Calc tab) do the everyday fitting maths: simple offsets
(travel, run and multiplier for 11¼°, 22½°, 30°, 45° and 60° fittings, and the cut after both
fittings' take-outs), rolling offsets (rise + roll → true offset → travel), elbow take-outs at any
angle (R × tan(angle ÷ 2) for LR, SR, 3D and 5D), mitered turns (cut angle and cut-back) and
equal-spread offsets. Steel also gets ASME B16.9 reducers and caps and B16.5 class 150 weld-neck
flanges in the fitting table.

## Database rules

Sheets travel through the same Firebase Realtime Database as the other KMR apps, under `fitup/`,
end-to-end encrypted. The rules are in the `kmr` repo (`firebase-rules.json`).

## Development

```
npm run build      # type-check and build to docs/
npm test           # solver, units, pairing and reader tests
npm run flow       # D-pad walkthrough of the glasses app and the phone page (Playwright)
```
