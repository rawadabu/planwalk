// Static demo build (npm run build:demo): no server, files next to index.html, hash routes.
export const STATIC = import.meta.env.VITE_STATIC === '1'
// Typed client for the Planwalk API. Same-origin (/api), cookies carry the session.
export type ProjectKind = 'development' | 'private'
export type UnitStatus = 'available' | 'reserved' | 'sold'
export interface Me { user: { id: string; name: string; email: string }; activeOrganizationId: string | null; organizations: Array<{ id: string; name: string; slug: string; role: string; kind: string }> }
export interface ProjectRow { id: string; organizationId: string; name: string; kind: ProjectKind; address: string | null; createdAt: string; units: number; houses: number }
export interface Unit { id: string; number: string; buildingId: string | null; houseId: string | null; floor: number | null; rooms: number | null; areaM2: number | null; status: UnitStatus; priceIls: number | null }
export interface HouseRow { id: string; title: string; public: boolean; projectId: string | null }
export interface Upload { id: string; fileName: string; sizeBytes: number; status: string; createdAt: string }
export interface ProjectDetail extends Omit<ProjectRow, 'units' | 'houses'> { role: string; lat: number | null; lng: number | null; northDeg: number | null; buildings: Array<{ id: string; name: string }>; units: Unit[]; houses: HouseRow[]; uploads: Upload[] }
export interface ShareRow { id: string; permission: 'view' | 'comment'; label: string | null; expiresAt: string | null; createdAt: string; revokedAt: string | null }
export interface NewShare extends Omit<ShareRow, 'createdAt' | 'revokedAt'> { token: string; path: string }

export interface HouseMeta {
  id: string; title: string
  /** the owning organisation's prices over the defaults (null = example prices) */
  prices?: Record<string, unknown> | null
  location: { address: string | null; lat: number; lng: number; north: number } | null
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
  uploadPlans: (id: string, file: File) => { const fd = new FormData(); fd.set('file', file); return req<Upload>(`/api/projects/${id}/uploads`, { method: 'POST', body: fd }) },
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
  designs: (houseId: string) => req<{ designs: DesignRow[]; can: { create: boolean; update: boolean; delete: boolean } }>(`/api/houses/${houseId}/designs`),
  createDesign: (houseId: string, b: { name: string; from?: string }) => req<DesignFull>(`/api/houses/${houseId}/designs`, json('POST', b)),
  design: (id: string) => req<DesignFull>(`/api/designs/${id}`),
  saveDesign: (id: string, b: { version: number; data: unknown; name?: string }) => req<DesignFull>(`/api/designs/${id}`, json('PUT', b)),
  deleteDesign: (id: string) => req<void>(`/api/designs/${id}`, { method: 'DELETE' }),
  orgPrices: (org: string) => req<{ defaults: any; prices: any; updatedAt: string | null; canEdit: boolean }>(`/api/orgs/${org}/prices`),
  saveOrgPrices: (org: string, prices: unknown) => req<{ prices: any; updatedAt: string }>(`/api/orgs/${org}/prices`, json('PUT', prices)),
  houseUrl: (id: string, share?: string) => STATIC ? `./houses/${id}/house.json` : `/api/houses/${id}/house.json${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  houseFile: (id: string, file: string, share?: string) => STATIC ? `./houses/${id}/${file}` : `/api/houses/${id}/${file}${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  libraryUrl: STATIC ? './library/' : '/api/library/',
}
