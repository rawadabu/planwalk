# Planwalk

Turn an architect's floor plans into a 1:1 3D home buyers can walk through in the browser.

```
apps/web         React 19 + TypeScript + Vite 8: landing page, customer dashboard, walkthrough UI
apps/api         Fastify 5 + TypeScript: houses, shared 3D library, projects (PDF upload); serves the built web app in production
packages/engine  Three.js 0.187 engine (framework-free TypeScript): renders a house.json on a canvas, emits events
packages/house   The house@1 format: Zod schema + types shared by API, web and engine
storage/         Local storage (houses/<id>/house.json + plan images, library/ textures + models, projects/ uploads)
```

## Run

Needs Node 22+ and Postgres 16 (local, or Supabase — copy `.env.example` to `.env`).

```bash
npm install
npm run build -w @planwalk/engine     # generates the engine's public type declarations
npm run dev -w @planwalk/api          # API on http://127.0.0.1:8787 — runs DB migrations + seeds the demo house on start
npm run dev -w @planwalk/web          # web on http://localhost:5173 (proxies /api)
```

Schema changes: edit `apps/api/src/db/schema.ts`, then `cd apps/api && npx drizzle-kit generate --name <change>`.

## Accounts, organizations and permissions (phase 1)

Better Auth (email + password, email verification, sessions) with the organization plugin.
Data lives in your Postgres (Supabase): `user`, `session`, `account`, `organization`, `member`, `invitation`,
plus `project`, `building`, `unit`, `house`, `plan_upload`, `share_link`.

| Role | Projects | Upload plans | Units (status/price) | Share links |
|---|---|---|---|---|
| owner / admin | create, edit, delete | ✓ | ✓ | create, turn off |
| architect | create, edit | ✓ | – | create, turn off |
| sales | read | – | ✓ | create, turn off |
| viewer | read | – | – | – |

- Private houses return 404 to anyone who isn't a member and has no valid share link (they never reveal they exist).
- Share links: random 192-bit token shown once; only its SHA-256 is stored; optional expiry; can be turned off.
- Invitations require a verified email before they can be accepted.

Production (one process): `npm run build && npm start` — the API serves `apps/web/dist`.

| Env | Default | |
|---|---|---|
| `PORT` / `HOST` | `8787` / `127.0.0.1` | API listen address |
| `STORAGE_DIR` | `./storage` | storage root (swap for S3/R2 behind `lib/storage.ts`) |
| `WEB_DIST` | `apps/web/dist` | built web app |
| `CORS_ORIGIN` | (off) | comma-separated origins if web and API are on different hosts |

## How it fits together

1. **Upload** — `POST /api/projects` stores the PDF (`storage/projects/<id>/source.pdf`), status `uploaded`.
2. **Pipeline** *(next)* — extract walls from the PDF vectors → review screen (openings, scale) → furniture from the shared library → writes `storage/houses/<id>/house.json`.
3. **View** — `/h/<id>`: the React page mounts the engine with `createViewer({ canvas, houseUrl, libraryUrl })`.

### Engine ↔ UI

The engine owns the frame loop (`Time` → `Experience.update()`): `Player` (input, collision, stairs) → `Camera` (tweens, orbit) →
`World` (animation) → `Measure` → `Renderer`. It never touches the DOM besides its canvas.
The UI subscribes to events: low-frequency ones (`floor`, `mode`, `room`, `nearStair`, `quality`, `time`) go into React state;
per-frame ones (`pose`, `measure`) are written straight to DOM refs so React does not re-render every frame.

### Performance choices (measured in the living room: 139 draw calls, 0.84 M triangles per frame)

- static geometry merged per storey × material (`StaticBatcher`); furniture as `InstancedMesh`
- shadow map rendered only when the sun moves (`shadowMap.autoUpdate = false`)
- GTAO at half resolution; transmission glass only on High; bloom off on Medium
- only the active storey's interior is drawn; a 4-light pool follows the walker instead of one light per fixture
- models decoded in a Web Worker; three.js is code-split out of the landing page

## Roadmap

- [ ] Plan pipeline service (Python: PDF vectors → walls, scale, storey alignment) + review UI
- [ ] Postgres for projects/users (replace the JSON-file repository in `apps/api/src/lib/projects.ts`)
- [ ] Auth, per-customer projects, share links with expiry
- [ ] Stripe: per-home and studio subscription
- [ ] S3/R2 storage + CDN for the library
- [ ] Furniture library v2 (beds, bath, appliances) generated once, reused by every house
- [ ] Tighten engine types (`noImplicitAny` is off for the ported internals; public API is typed)

## Phase 2 — in the walkthrough

- **Areas** (`שטחים`): every room per storey, from the architect's written dimensions; rooms without dimensions are measured from the drawing (marked *). Balconies separately.
- **Outside view** (`מבחוץ`): orbit the whole house from the garden.
- **Real sun** (`שמש אמיתית`): the project's address (lat/lng) + plan north → sun position for any date and hour, or play the whole day. Set it on the project page → Location. Address search uses OpenStreetMap Nominatim.
- **Comments** (`הערות`): pin a note to a spot in the house; replies; resolve. Org members comment by role (viewer: write · sales/architect: + resolve · owner/admin: + delete). Share links with the *comment* permission let buyers comment with their name; view-only links and the public demo can't.

## Build story (`/h/:id/story`)

A scroll page where the house builds itself from its own plan data: blueprint lines → ground slab → concrete frame → block walls → windows → finished house, at dusk turning to golden hour. Then the camera goes into the kitchen, where buyers choose cabinet (walnut / oak / navy / sage / white) and floor (light tile / oak / concrete) finishes live. Engine: `viewer.setStory(t)` and `viewer.setFinish(slot, option)`; nothing is rebuilt per frame (stages are revealed with rising clipping planes).

## Designs (sheet A-03)

`packages/design`: `design@1` = finish choices layered over a house's base model (the base is never edited).
Targets are `<part>@<scope>` — parts `floor | walls | ceiling | joinery | worktop | frames`, scope `all`, `f1` (a storey) or `f1.r6` (a room); the most specific wins.
A finish catalogue (paint, wood, lacquer, tile, stone, concrete, aluminium) with allowed categories per part, build rules (errors block saving, warnings e.g. wood floor in a bathroom), and `DesignDoc` with undo/redo. `npm test -w @planwalk/design`.
API: `GET/POST /api/houses/:id/designs`, `GET/PUT/DELETE /api/designs/:id` (PUT sends the version it edited → 409 on conflict), `GET /api/designs/:id/revisions`, `POST /api/designs/:id/restore`. Every save is kept as a revision.
Roles: owner/admin/architect create, edit, delete · sales create, edit · viewer reads. Engine: `viewer.applyDesign(storeyLooks(design))`.

## Kitchen designer (sheet A-05)

`packages/design/src/kitchen.ts`: a run is a straight line of modules along a wall, stored in the design as an edit (`run:f1.0`), so undo/redo, saving and versions apply.
`runsFromPlan` finds the runs the plan draws in the kitchen (length from the drawing), `autoFill` fills a run exactly with standard widths (fridge/oven/pantry 60, hob, sink, dishwasher, drawers 30–120, filler ≤ 15 cm),
`checkRun` applies fitter's rules (length, valid widths, hob vs tall unit and sink, dishwasher next to the sink, walkway ≥ 90 cm to the island), `applyRun` turns modules into `cabinet` items + worktop for the engine.
Sizes: base 87 cm + 3 cm worktop, depth 60, tall 220, wall units 70 cm high from 145 cm, never in front of a window.

## Costing (sheet A-06)

`packages/design/src/cost.ts`: `costReport(base, design, prices)` → lines grouped by room / kitchen / changes, net, VAT, total, the architect's base total and the upgrade over it.
Quantities come from the edited house: floor and ceiling m² (written dimensions first), wall m² = perimeter × 2.8 m − windows on the room's edges, kitchen modules by type and width (fronts multiplier per joinery finish), worktop and installation per metre, window changes (fee + extra glazed m²), moved partitions per m² of wall, frame recolour.
Price book per organisation (`price_book` table, `GET/PUT /api/orgs/:org/prices`, owner/admin edit, strict validation) over example defaults; the house meta carries it to the viewer. UI: live cost line in the Design and Kitchen panels, a Cost panel (budget, breakdown, change per room), and Price book in the app.

## Carpenter drawings (sheet A-07)

`packages/design/src/shop.ts`: `cabinets(run)` (mm sizes, fronts, hinges, runners, handles, legs, shelves), `panels()` (every board with edge banding, merged), `nest()` (shelf packing on 2800×2070 boards, 4 mm kerf, 10 mm trim, grain kept on fronts), `worktop()` (pieces ≤ 3000 mm split at a unit joint, sink/hob cut-outs), `hardware()`.
Page `/h/:id/sheets` (A3 landscape, Hebrew): K-01 materials & quantities, K-02 plan + elevation with dimension chains (as seen from the front), cabinet schedule, cut list, board layouts, worktop. "הורדת PDF" uses the browser's PDF printer (vector, works in the static demo). Opened from the Kitchen panel ("PDF לנגר") or `?design=<id>` for a saved design.
