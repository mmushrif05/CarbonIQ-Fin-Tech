# Datum Solutions — logo assets

Drop this folder into the app (e.g. `public/brand/` or `src/assets/brand/`) and reference the files below.

## Files

| File | Size | Use |
|---|---|---|
| `datum-lockup.png` | 451×167, transparent | Header, nav bar, login screen, email footer, PDF header |
| `datum-lockup-white.png` | 451×167, transparent | The same lockup knocked out in white, for dark backgrounds |
| `datum-mark.png` | 512×512, transparent | Square icon — app icon, avatar, sidebar collapsed state |
| `datum-mark-192.png` / `-96` / `-32` | transparent | PWA manifest, browser tab, small UI |
| `apple-touch-icon-180.png` | 180×180, opaque white | iOS home-screen icon (iOS shows black behind transparency) |
| `favicon.ico` | multi-size 16→256 | Legacy `/favicon.ico` |

## HTML

```html
<link rel="icon" href="/brand/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/datum-mark-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/brand/datum-mark-192.png">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon-180.png">

<img src="/brand/datum-lockup.png" alt="Datum Solutions" height="36">
```

Always set `height` (not `width`) and let the width follow — the lockup is 2.70 : 1.

## Brand colours

| Token | Hex | Use |
|---|---|---|
| Green | `#0E7A55` | Primary accent, links, active states |
| Green soft | `#E4EFE9` | Accent fills, chips |
| Ink | `#16211C` | Body text |
| Muted | `#586158` | Secondary text |
| Paper | `#F3F3EE` | Page background |
| Panel | `#FBFBF8` | Cards on paper |
| Amber | `#9A6A1E` | Warnings, "in progress" states |
| Line | `rgba(22,33,28,.11)` | Borders, dividers |

Typefaces used in Datum material: **Fraunces** (display / headings) and **Archivo** (UI and body), both on Google Fonts.

## Rules

- **Clear space:** keep free space around the lockup equal to the height of the "D" in DATUM.
- **Minimum size:** 28 px tall for the lockup. Below that use the mark alone.
- Do not recolour, stretch, add effects, or place the colour lockup on a dark or busy background — use `datum-lockup-white.png` there.

## One caveat

These are raster (PNG) assets, exported from the original artwork at its full available resolution. `datum-lockup.png` at 451×167 is roughly 4× the pixels needed at its normal on-screen size (~113×42), so it stays sharp on retina screens and in print at small sizes.

There is **no true SVG** — the source artwork available is raster, and auto-tracing it would subtly distort the mark and the letterforms. If a vector is needed for large-format use (signage, banners, a hero at 400 px+), ask the original designer for the `.ai` / `.eps` / `.svg` master.
