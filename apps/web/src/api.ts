// Typed client for the Planwalk API. All requests are same-origin (/api), proxied by Vite in dev.
export interface ProjectDto { id: string; name: string; status: 'uploaded' | 'extracting' | 'review' | 'furnishing' | 'ready' | 'failed'; createdAt: string; sourceFile?: string; houseId?: string }
export interface HouseSummary { id: string; title: string }

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Request failed (${res.status})`) }
  return res.json() as Promise<T>
}
export const api = {
  houses: () => fetch('/api/houses').then(r => json<HouseSummary[]>(r)),
  projects: () => fetch('/api/projects').then(r => json<ProjectDto[]>(r)),
  createProject: (name: string, file: File) => {
    const body = new FormData(); body.set('name', name); body.set('file', file)
    return fetch('/api/projects', { method: 'POST', body }).then(r => json<ProjectDto>(r))
  },
  houseUrl: (id: string) => `/api/houses/${id}/house.json`,
  houseFile: (id: string, file: string) => `/api/houses/${id}/${file}`,
  libraryUrl: '/api/library/',
}
