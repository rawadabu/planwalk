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
