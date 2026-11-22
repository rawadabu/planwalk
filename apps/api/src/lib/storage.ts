import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

/** File storage behind one interface so the local folder can be swapped for S3/R2 without touching routes. */
export interface Storage {
  read(key: string): Promise<Buffer>
  write(key: string, data: Buffer | string): Promise<void>
  list(prefix: string): Promise<string[]>
  exists(key: string): Promise<boolean>
  localPath(key: string): string
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/i
function resolveKey(key: string): string {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw Object.assign(new Error('bad key'), { statusCode: 400 })
  return path.join(config.storageDir, key)
}

export const storage: Storage = {
  read: key => fs.readFile(resolveKey(key)),
  async write(key, data) { const p = resolveKey(key); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data) },
  async list(prefix) { try { return await fs.readdir(resolveKey(prefix)) } catch { return [] } },
  async exists(key) { try { await fs.access(resolveKey(key)); return true } catch { return false } },
  localPath: key => resolveKey(key),
}
