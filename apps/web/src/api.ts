// Static demo build (npm run build:demo): no server, files next to index.html, hash routes.
export const STATIC = import.meta.env.VITE_STATIC === '1'
/** One photoreal image of the house (rendered offline with Blender). */
export interface Render { id: string; name: string; storey: number; file: string }
// Typed client for the Planwalk API. Same-origin (/api), cookies carry the session.
export type ProjectKind = 'development' | 'private'
export type UnitStatus = 'available' | 'reserved' | 'sold'
export interface ClientHome { projectId: string; name: string; address: string | null; studio: string; houses: Array<{ id: string; title: string }> }
export interface Me { user: { id: string; name: string; email: string }; activeOrganizationId: string | null; organizations: Array<{ id: string; name: string; slug: string; role: string; kind: string }>; clientOf: ClientHome[] }
/** What a client changed against the architect's plan (packages/design/src/report.ts). */
export interface Change { kind: 'finish' | 'window' | 'wall' | 'kitchen' | 'furniture'; storey: number | null; where: string; what: string; issue?: string }
export interface ChangeReport { changes: Change[]; counts: Record<Change['kind'], number>; cost: { base: number; total: number; difference: number }; note: string | null; comments?: number }
export interface Clients { members: Array<{ id: string; name: string; email: string; since: string }>; invites: Array<{ id: string; email: string; name: string | null; createdAt: string; expiresAt: string }> }
export interface NewInvite { id: string; email: string; name: string | null; expiresAt: string; link: string }
export interface Feedback { id: string; houseId: string; designId: string | null; designVersion: number | null; designName: string | null; author: string | null; message: string | null; report: ChangeReport; status: 'sent' | 'seen' | 'done'; createdAt: string }
/** What changed between two versions of the plans (packages/design/src/versions.ts). */
export interface PlanChange { kind: 'room' | 'opening' | 'wall'; storey: 0 | 1 | 2; where: string; what: string; rect: [number, number, number, number] }
export interface PlanChanges { changes: PlanChange[]; counts: { room: number; opening: number; wall: number }; area: { before: number; after: number } }
export interface UpdatePreview { target: { id: string; title: string; version: number }; number: number; changes: PlanChanges; clients: number
  designs: Array<{ designId: string; name: string; author: string | null; kept: number; dropped: Array<{ key: string; what: string }> }> }
export interface Published { houseId: string; number: number; changes: PlanChanges | null; notified: number; link: string }
export interface Versions { current: number; seen: number; versions: Array<{ number: number; note: string | null; changes: PlanChanges | null; createdAt: string; by: string | null; dropped: string[] }> }
/** A photoreal picture made from a view of the house. */
export interface RealView { id: string; room: string | null; status: 'pending' | 'done' | 'failed'; file: string | null; error: string | null; createdAt: string; by: string | null }
export interface RealViews { available: boolean; used: number; quota: number; left: number; views: RealView[] }
export interface JoinInfo { project: string; studio: string; invitedBy: string | null; email: string; name: string | null }
export interface ProjectRow { id: string; organizationId: string; name: string; kind: ProjectKind; address: string | null; createdAt: string; units: number; houses: number; asClient?: boolean }
export interface Unit { id: string; number: string; buildingId: string | null; houseId: string | null; floor: number | null; rooms: number | null; areaM2: number | null; status: UnitStatus; priceIls: number | null }
export interface HouseRow { id: string; title: string; public: boolean; projectId: string | null; version?: number }
export interface BuildReport { readings: 'api' | 'cache' | 'none' | 'drawing'; scale: { ptPerCm: number; from: 'dimensions' | 'assumed' | 'drawing'; dimensions: number; agree: number; written: number | null }; warnings: string[]; storeys: Array<{ storey: number; name: string; title: string | null; rooms: number; unsureRooms: number; openings: number; unsureOpenings: number; stairs: number }> }
export interface Upload { id: string; projectId?: string; fileName: string; sizeBytes: number; status: string; createdAt: string; houseId?: string | null; targetHouseId?: string | null; error?: string | null; report?: BuildReport | null; published?: Published }
type Box = [number, number, number, number]
/** plan@1 as the review screen needs it: what was understood from the sheet, per storey, in house px (≈ cm). */
export interface PlanDoc {
  scale: BuildReport['scale']; warnings: string[]
  storeys: Array<{
    storey: number; name: string; title: string | null; bounds: Box; walls: Array<Array<[number, number]>>
    rooms: Array<{ name: string; rect: Box; area: number; outdoor: boolean; from: 'label' | 'split' | 'guess'; at?: [number, number]; tiles: Box[]; void?: boolean }>
    openings: Array<{ kind: 'door' | 'window' | 'glass-door'; rect: Box; axis: 'h' | 'v'; sure: boolean }>
    stairs: Array<{ box: Box; treads: Box[] }>; railings: Box[]
  }>
}
export interface ProjectDetail extends Omit<ProjectRow, 'units' | 'houses'> { role: string; lat: number | null; lng: number | null; northDeg: number | null; buildings: Array<{ id: string; name: string }>; units: Unit[]; houses: HouseRow[]; uploads: Upload[] }
export interface ShareRow { id: string; permission: 'view' | 'comment'; label: string | null; expiresAt: string | null; createdAt: string; revokedAt: string | null }
export interface NewShare extends Omit<ShareRow, 'createdAt' | 'revokedAt'> { token: string; path: string }

export interface HouseMeta {
  id: string; title: string
  /** the owning organisation's prices over the defaults (null = example prices) */
  prices?: Record<string, unknown> | null
  location: { address: string | null; lat: number; lng: number; north: number } | null
  /** the published plan version, and whether this client has not looked at it yet */
  version?: { number: number; unseen: boolean }
  viewer: { signedIn: boolean; name: string | null; role: string | null; via: 'member' | 'share' | 'public' }
  can: { comment: boolean; resolve: boolean }
}
export interface Comment { id: string; parentId: string | null; authorName: string; body: string; floor: 0 | 1 | 2; x: number; y: number; h: number; resolved: boolean; createdAt: string; mine: boolean }
export interface ProjectLocation { address?: string | null; lat?: number | null; lng?: number | null; northDeg?: number | null; name?: string }

export interface DesignRow { id: string; name: string; version: number; updatedAt: string; updatedBy: string | null }
export interface DesignFull { id: string; houseId: string; name: string; data: unknown; version: number; updatedAt: string; issues?: Array<{ target: string; level: string; message: string }> }

export class ApiError extends Error { constructor(message: string, public status: number, public body: any = {}) { super(message) } }
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...init?.headers } })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error || body.message || `Request failed (${res.status})`, res.status, body)
  return body as T
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
const shareHdr = (share?: string): RequestInit => (share ? { headers: { 'x-share-token': share } } : {})
// The demo house in the static build: same location as the seeded demo project, read-only
const DEMO_META: HouseMeta = { id: 'twin-a', title: 'בית דו־משפחתי · יחידה א׳', prices: null, location: { address: 'Herzliya, Israel', lat: 32.1663, lng: 34.8433, north: 0 }, viewer: { signedIn: false, name: null, role: null, via: 'public' }, can: { comment: false, resolve: false } }

export const api = {
  me: () => req<Me>('/api/me'),
  houses: () => req<HouseRow[]>('/api/houses'),
  projects: (org?: string) => req<ProjectRow[]>('/api/projects' + (org ? `?org=${encodeURIComponent(org)}` : '')),
  createProject: (b: { organizationId: string; name: string; kind: ProjectKind; address?: string }) => req<ProjectRow>('/api/projects', json('POST', b)),
  project: (id: string) => req<ProjectDetail>(`/api/projects/${id}`),
  createUnit: (id: string, b: { number: string; buildingName?: string; floor?: number; rooms?: number; areaM2?: number; priceIls?: number; houseId?: string }) => req<Unit>(`/api/projects/${id}/units`, json('POST', b)),
  updateUnit: (id: string, b: { status?: UnitStatus; priceIls?: number | null }) => req<Unit>(`/api/units/${id}`, json('PATCH', b)),
  uploadPlans: (id: string, file: File, updates?: string) => { const fd = new FormData(); fd.set('file', file); return req<Upload>(`/api/projects/${id}/uploads${updates ? `?house=${encodeURIComponent(updates)}` : ''}`, { method: 'POST', body: fd }) },
  upload: (id: string) => req<Upload>(`/api/uploads/${id}`),
  uploadPlan: (id: string) => req<PlanDoc>(`/api/uploads/${id}/plan`),
  editPlan: (id: string, b: { rooms?: Array<{ storey: number; index: number; name: string }>; openings?: Array<{ storey: number; index: number; kind: 'window' | 'glass-door' }> }) => req<{ report: BuildReport }>(`/api/uploads/${id}/plan`, json('PATCH', b)),
  publishUpload: (id: string, b: { note?: string; notify?: boolean } = {}) => req<Upload>(`/api/uploads/${id}/publish`, json('POST', b)),
  uploadChanges: (id: string) => req<UpdatePreview>(`/api/uploads/${id}/changes`),
  versions: (houseId: string, share?: string) => req<Versions>(`/api/houses/${houseId}/versions`, shareHdr(share)),
  versionUrl: (houseId: string, n: number, share?: string) => `/api/houses/${houseId}/v/${n}/house.json${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  markSeen: (houseId: string) => req<void>(`/api/houses/${houseId}/seen`, { method: 'POST' }),
  rebuildUpload: (id: string) => req<{ ok: boolean }>(`/api/uploads/${id}/rebuild`, { method: 'POST' }),
  clients: (projectId: string) => req<Clients>(`/api/projects/${projectId}/clients`),
  inviteClient: (projectId: string, b: { email: string; name?: string }) => req<NewInvite>(`/api/projects/${projectId}/clients`, json('POST', b)),
  revokeInvite: (projectId: string, id: string) => req<void>(`/api/projects/${projectId}/clients/invites/${id}`, { method: 'DELETE' }),
  removeClient: (projectId: string, id: string) => req<void>(`/api/projects/${projectId}/clients/${id}`, { method: 'DELETE' }),
  joinInfo: (token: string) => req<JoinInfo>(`/api/join/${encodeURIComponent(token)}`),
  join: (token: string) => req<{ projectId: string; houseId: string | null }>(`/api/join/${encodeURIComponent(token)}`, { method: 'POST' }),
  sendFeedback: (houseId: string, b: { designId: string; message?: string }) => req<{ id: string; createdAt: string; report: ChangeReport }>(`/api/houses/${houseId}/feedback`, json('POST', b)),
  feedback: (projectId: string) => req<Feedback[]>(`/api/projects/${projectId}/feedback`),
  setFeedback: (id: string, status: Feedback['status']) => req<{ id: string; status: Feedback['status'] }>(`/api/feedback/${id}`, json('PATCH', { status })),
  shares: (houseId: string) => req<ShareRow[]>(`/api/houses/${houseId}/shares`),
  createShare: (houseId: string, b: { permission: 'view' | 'comment'; expiresInDays: number | null; label?: string }) => req<NewShare>(`/api/houses/${houseId}/shares`, json('POST', b)),
  revokeShare: (id: string) => req<void>(`/api/shares/${id}`, { method: 'DELETE' }),
  resolveShare: (token: string) => req<{ houseId: string; title: string; permission: string; expiresAt: string | null }>(`/api/share/${encodeURIComponent(token)}`),
  updateProject: (id: string, b: ProjectLocation) => req<ProjectRow>(`/api/projects/${id}`, json('PATCH', b)),
  geocode: (q: string) => req<Array<{ label: string; lat: number; lng: number }>>(`/api/geocode?q=${encodeURIComponent(q)}`),
  houseMeta: (id: string, share?: string) => (STATIC ? Promise.resolve({ ...DEMO_META, id }) : req<HouseMeta>(`/api/houses/${id}/meta`, shareHdr(share))),
  comments: (id: string, share?: string) => (STATIC ? Promise.resolve([] as Comment[]) : req<Comment[]>(`/api/houses/${id}/comments`, shareHdr(share))),
  addComment: (id: string, b: { body: string; floor: number; x: number; y: number; h: number; parentId?: string; authorName?: string }, share?: string) =>
    req<Comment>(`/api/houses/${id}/comments`, { ...json('POST', b), ...shareHdr(share) }),
  resolveComment: (id: string, resolved: boolean) => req<Comment>(`/api/comments/${id}`, json('PATCH', { resolved })),
  deleteComment: (id: string, share?: string) => req<void>(`/api/comments/${id}`, { method: 'DELETE', ...shareHdr(share) }),
  realViews: (houseId: string) => req<RealViews>(`/api/houses/${houseId}/realviews`),
  createRealView: (houseId: string, frame: Blob, b: { room?: string | null; scene: 'interior' | 'exterior'; width: number; height: number; designId?: string }) => {
    const fd = new FormData()
    // fields first: the server reads them with the file
    fd.set('room', b.room ?? ''); fd.set('scene', b.scene); fd.set('width', String(b.width)); fd.set('height', String(b.height)); if (b.designId) fd.set('designId', b.designId)
    fd.set('file', frame, 'frame.jpg')
    return req<RealView & { left: number }>(`/api/houses/${houseId}/realviews`, { method: 'POST', body: fd })
  },
  brief: (houseId: string) => req<{ brief: unknown | null }>(`/api/houses/${houseId}/brief`),
  saveBrief: (houseId: string, brief: unknown) => req<{ brief: unknown }>(`/api/houses/${houseId}/brief`, json('PUT', brief)),
  briefs: (houseId: string) => req<Array<{ name: string | null; brief: unknown; updatedAt: string }>>(`/api/houses/${houseId}/briefs`),
  designs: (houseId: string) => req<{ designs: DesignRow[]; can: { create: boolean; update: boolean; delete: boolean } }>(`/api/houses/${houseId}/designs`),
  createDesign: (houseId: string, b: { name: string; from?: string }) => req<DesignFull>(`/api/houses/${houseId}/designs`, json('POST', b)),
  design: (id: string) => req<DesignFull>(`/api/designs/${id}`),
  saveDesign: (id: string, b: { version: number; data: unknown; name?: string }) => req<DesignFull>(`/api/designs/${id}`, json('PUT', b)),
  deleteDesign: (id: string) => req<void>(`/api/designs/${id}`, { method: 'DELETE' }),
  orgPrices: (org: string) => req<{ defaults: any; prices: any; updatedAt: string | null; canEdit: boolean }>(`/api/orgs/${org}/prices`),
  saveOrgPrices: (org: string, prices: unknown) => req<{ prices: any; updatedAt: string }>(`/api/orgs/${org}/prices`, json('PUT', prices)),
  renders: (id: string, share?: string) => (STATIC ? fetch(`./houses/${id}/renders.json`).then(r => (r.ok ? r.json() : [])).catch(() => []) : req<Render[]>(`/api/houses/${id}/renders`, shareHdr(share))) as Promise<Render[]>,
  houseUrl: (id: string, share?: string) => STATIC ? `./houses/${id}/house.json` : `/api/houses/${id}/house.json${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  houseFile: (id: string, file: string, share?: string) => STATIC ? `./houses/${id}/${file}` : `/api/houses/${id}/${file}${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  libraryUrl: STATIC ? './library/' : '/api/library/',
}
