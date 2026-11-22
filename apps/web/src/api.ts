// Typed client for the Planwalk API. Same-origin (/api), cookies carry the session.
export type ProjectKind = 'development' | 'private'
export type UnitStatus = 'available' | 'reserved' | 'sold'
export interface Me { user: { id: string; name: string; email: string }; activeOrganizationId: string | null; organizations: Array<{ id: string; name: string; slug: string; role: string; kind: string }> }
export interface ProjectRow { id: string; organizationId: string; name: string; kind: ProjectKind; address: string | null; createdAt: string; units: number; houses: number }
export interface Unit { id: string; number: string; buildingId: string | null; houseId: string | null; floor: number | null; rooms: number | null; areaM2: number | null; status: UnitStatus; priceIls: number | null }
export interface HouseRow { id: string; title: string; public: boolean; projectId: string | null }
export interface Upload { id: string; fileName: string; sizeBytes: number; status: string; createdAt: string }
export interface ProjectDetail extends Omit<ProjectRow, 'units' | 'houses'> { role: string; buildings: Array<{ id: string; name: string }>; units: Unit[]; houses: HouseRow[]; uploads: Upload[] }
export interface ShareRow { id: string; permission: 'view' | 'comment'; label: string | null; expiresAt: string | null; createdAt: string; revokedAt: string | null }
export interface NewShare extends Omit<ShareRow, 'createdAt' | 'revokedAt'> { token: string; path: string }

export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...init?.headers } })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error || body.message || `Request failed (${res.status})`, res.status)
  return body as T
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

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
  houseUrl: (id: string, share?: string) => `/api/houses/${id}/house.json${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  houseFile: (id: string, file: string, share?: string) => `/api/houses/${id}/${file}${share ? `?share=${encodeURIComponent(share)}` : ''}`,
  libraryUrl: '/api/library/',
}
