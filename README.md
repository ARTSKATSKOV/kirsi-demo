# Interactive 3D floor plan — concept demo

A small, dependency-free interactive concept: a 3D apartment model, a schematic
building grid with unit statuses, and a project timeline. Plain ES modules with a
vendored Three.js — no build step, no backend.

**All data shipped here is synthetic, illustrative sample data** — unit sizes,
prices, statuses and timeline. It is not a real price list and refers to no real
development, developer or person.

## Layout

| Path | What |
| --- | --- |
| `public/` | **The site — deploy only this folder** (`index.html`, `css/`, `js/`, `vendor/`, `fonts/`, `data/`, `robots.txt`) |
| `tools/` | Dev-only: unit tests, e2e checks, screenshot scripts, a tiny static server |
| `screenshots/` | Generated screenshots (git-ignored) |
| `README.md` | This file — kept outside `public/`, never served |

## Run locally

Node is enough (no build step, no Python):

```bash
npx serve public -l 8080
# or: cd public && npx serve -l 8080
# or, without npx: node tools/serve.mjs 8080
```

Then open http://localhost:8080/.

## Sections

1. **Apartment (3D)** — hero 3-room flat: orbit/zoom, room chips, click a room for
   a card, 3D / floor-plan toggle, day / night lighting.
2. **Floors** — schematic grid of the sample units (free / reserved / sold),
   filters by availability and room count; the hero unit links back into the 3D view.
3. **Timeline** — illustrative sales / construction / handover milestones.

## Data

- `public/data/units.csv` — the illustrative sample dataset (unit, floor, rooms,
  area, balcony, price, status).
- `public/js/data/unitsSource.js` — provenance note shown next to the grid.
- Room areas in the 3D apartment are **conceptual**: measured to wall centrelines and
  summing to the unit total; net areas inside the walls would be smaller.

## Tests

```bash
cd tools
npm install          # playwright, for e2e + screenshots
npm test             # unit tests (node:test)
npm run e2e          # end-to-end checks (serves ../public, drives a headless browser)
npm run screenshots  # headless screenshots
```

## License / attribution

Demo code and layout — free to read. Fonts are bundled under their own licences
(see `public/fonts/`). Three.js is vendored under its MIT licence
(`public/vendor/three/LICENSE`).
