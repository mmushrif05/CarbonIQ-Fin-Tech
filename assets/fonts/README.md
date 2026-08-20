# Report faces

Two open-licensed families, embedded in every PDF the application generates.

| Role | Family | Licence |
|---|---|---|
| Section titles (serif) | **Lora** — Regular, Bold, Italic | SIL Open Font Licence 1.1 — `Lora-OFL.txt` |
| Everything else (humanist sans) | **Work Sans** — Regular, Bold, Italic | SIL Open Font Licence 1.1 — `WorkSans-OFL.txt` |

## Why these are in the repository

`services/partc-theme.js` reads them with `fs.readFileSync` at render time.
Netlify's bundler traces `require()` calls, not file paths, so the files are
named in `netlify.toml` under `included_files` — without that the function
ships without them and every report silently falls back to the built-in PDF
fonts.

They were chosen to match the *observed* typographic system of PCAF's own
published documents — a transitional serif for section titles, a humanist
sans for body and sub-heads. They are **not** PCAF's licensed fonts, and
nothing here reproduces PCAF branding.

## If a face is missing

`registerFonts()` falls back to the built-in Times and Helvetica and reports
`embedded: false`. The document is plainer but never broken: the WinAnsi
transliteration in `partc-docgen.js` then covers the characters those fonts
cannot encode.
