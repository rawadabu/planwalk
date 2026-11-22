import { eq } from 'drizzle-orm'
import { db } from './client.js'
import { house, organization, project } from './schema.js'

/** Idempotent: the public demo house (twin-a) inside a system "Planwalk Demo" organization. */
export async function seed() {
  const ORG = 'planwalk-demo', PROJECT = 'demo-twin-house'
  if (!(await db.select().from(organization).where(eq(organization.id, ORG)).limit(1)).length)
    await db.insert(organization).values({ id: ORG, name: 'Planwalk Demo', slug: 'planwalk-demo', metadata: JSON.stringify({ kind: 'developer', system: true }) })
  if (!(await db.select().from(project).where(eq(project.id, PROJECT)).limit(1)).length)
    await db.insert(project).values({ id: PROJECT, organizationId: ORG, name: 'Twin house (demo)', kind: 'private' })
  // demo location for the real sun path (central coastal Israel); only fills what is still empty
  const [p] = await db.select().from(project).where(eq(project.id, PROJECT)).limit(1)
  if (p.lat == null) await db.update(project).set({ address: 'Herzliya, Israel', lat: 32.1663, lng: 34.8433, northDeg: 0 }).where(eq(project.id, PROJECT))
  if (!(await db.select().from(house).where(eq(house.id, 'twin-a')).limit(1)).length)
    await db.insert(house).values({ id: 'twin-a', projectId: PROJECT, title: 'בית דו־משפחתי · יחידה א׳', public: true })
}
