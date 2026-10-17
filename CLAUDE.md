# Bellu Grave Finder

Mobile-first search for notable graves in Cimitirul Bellu (Bucharest), transcribed from the
entrance information board ("Planul Cimitirului Bellu", section "Personalități din lumea
culturală, științifică și militară"), with an interactive Leaflet map of the plan.

## Layout
- Vite + TypeScript, no framework. `npm run dev`, `npm run build` (runs `tsc --noEmit` first).
- `index.html` – page shell. `src/main.ts` – search + results list. `src/map.ts` – Leaflet map
  (`CRS.Simple` over `src/assets/plan.jpg`; one circle marker per figura).
- `src/data/graves.ts` – `RAW` string, one line per grave: `figura|name|years|role`; `NOTES`.
- `src/data/plots.ts` – figura → `[x, y]` pixel position of its label on `plan.jpg` (1910×870,
  origin top-left). P.M. entries all point at the Parcul Memorial area.
- `src/assets/plan.jpg` – greyscale, auto-contrasted crop of `photos/board-full-plan.jpg`
  (crop box 300,515 → 2210,1385).
- `photos/` – original phone photos of the boards; the source of truth for the data.
  - `board-full-plan.jpg` – whole plan + full name list (figura numbers 1–126, B.M., P.M.)
  - `board-ortodox-numbered.jpg` – the newer colour board (2026) with a numbered selection
    of ~100 graves and a north-up map; uses its own marker numbers 1–100.
  - `board-detail-*.jpg` – closer shots of the plan/list for re-checking text.
- PWA via `vite-plugin-pwa` (config in `vite.config.ts`): manifest, `autoUpdate` service worker that
  precaches the app shell, JS/CSS and `plan.jpg`; Google Fonts cached at runtime. Icons in `public/`
  (generated with PIL: brown rounded square + cross; `icon-maskable-512.png` has a safe-zone margin).
- `.github/workflows/deploy.yml` – builds on PRs, deploys `main` to GitHub Pages
  (Pages source must be set to "GitHub Actions"). Vite `base: "./"` so any repo name works.

## Behaviour
- Search is diacritic-insensitive, multi-term AND across fig/name/role/years.
- A bare number searches by figura (e.g. `96`); an exact figura label (`8 bis`, `1 B.M.`)
  matches only that figura (this is what tapping a marker puts in the box).
- Query is mirrored to the URL hash (`#q=...`).
- Ion Caramitru is NOT on the board; added manually as "94–96 (near)" with a note
  (buried Sept 2021 on Aleea Actorilor, reported near Laura Stoica, Fig. 94).
- B.M. = Bellu Militar (right-hand strip of the plan), P.M. = Parcul Memorial al Academiei Române.
- On the plan, figs 1–23 appear twice: the right-hand strip (x > ~1580) is Bellu Militar.

## Known issues / ideas
- Transcribed by reading photos: some years/spellings may be wrong (check `photos/`).
  Board itself has oddities kept as-is (e.g. Constantin F. Robescu 1839-1972,
  Tudor Vianu 1857-1964, Mihail G. Obedenaru 1893-1895).
- Figs 74 and 75 bis are listed but not drawn on the plan → no marker. Fig. 10 position is a
  best guess (label next to 10 bis).
- Could merge in the colour board's entries (photos/board-ortodox-numbered.jpg) and
  graves not on the boards.
- "Locate me" on the plan would need georeferencing the plan image against GPS coordinates.
