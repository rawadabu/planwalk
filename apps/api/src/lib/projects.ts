import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { storage } from './storage.js'

/**
 * A project = one home a customer uploaded. Status follows the processing pipeline:
 * uploaded → extracting (walls from PDF vectors) → review (a person confirms openings/scale) → furnishing → ready
 * Stored as JSON files for now (Repository pattern) — swap for Postgres without changing routes.
 */
export const ProjectStatus = z.enum(['uploaded', 'extracting', 'review', 'furnishing', 'ready', 'failed'])
export const Project = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  status: ProjectStatus,
  createdAt: z.string(),
  sourceFile: z.string().optional(),
  houseId: z.string().optional(),      // set when a house.json exists for the viewer
})
export type Project = z.infer<typeof Project>

export const projects = {
  async list(): Promise<Project[]> {
    const ids = await storage.list('projects')
    const all = await Promise.all(ids.map(id => this.get(id).catch(() => null)))
    return all.filter((p): p is Project => !!p).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async get(id: string): Promise<Project> {
    return Project.parse(JSON.parse((await storage.read(`projects/${id}/project.json`)).toString()))
  },
  async create(name: string, pdf: Buffer, fileName: string): Promise<Project> {
    const id = randomUUID().slice(0, 8)
    await storage.write(`projects/${id}/source.pdf`, pdf)
    const p: Project = { id, name, status: 'uploaded', createdAt: new Date().toISOString(), sourceFile: fileName }
    await storage.write(`projects/${id}/project.json`, JSON.stringify(p, null, 2))
    return p
  },
}
