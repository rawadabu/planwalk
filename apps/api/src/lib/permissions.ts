import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc, ownerAc, memberAc } from 'better-auth/plugins/organization/access'

/**
 * Who can do what inside an organization. One source of truth used by Better Auth (org management)
 * and by our own routes (projects, uploads, share links).
 */
export const statements = {
  ...defaultStatements,
  project: ['read', 'create', 'update', 'delete'],
  upload: ['create', 'review'],
  unit: ['update'],
  share: ['create', 'revoke'],
  comment: ['create', 'resolve', 'delete'],
  design: ['create', 'update', 'delete'],
} as const
export const ac = createAccessControl(statements)

export const roles = {
  owner: ac.newRole({ ...ownerAc.statements, project: ['read', 'create', 'update', 'delete'], upload: ['create', 'review'], unit: ['update'], share: ['create', 'revoke'], comment: ['create', 'resolve', 'delete'], design: ['create', 'update', 'delete'] }),
  admin: ac.newRole({ ...adminAc.statements, project: ['read', 'create', 'update', 'delete'], upload: ['create', 'review'], unit: ['update'], share: ['create', 'revoke'], comment: ['create', 'resolve', 'delete'], design: ['create', 'update', 'delete'] }),
  architect: ac.newRole({ ...memberAc.statements, project: ['read', 'create', 'update'], upload: ['create', 'review'], share: ['create', 'revoke'], comment: ['create', 'resolve'], design: ['create', 'update', 'delete'] }),
  sales: ac.newRole({ ...memberAc.statements, project: ['read'], unit: ['update'], share: ['create', 'revoke'], comment: ['create', 'resolve'], design: ['create', 'update'] }),
  viewer: ac.newRole({ ...memberAc.statements, project: ['read'], comment: ['create'] }),
}
export type Role = keyof typeof roles
export type Resource = 'project' | 'upload' | 'unit' | 'share' | 'comment' | 'design'

/** A client belongs to one project (not to the organization): they look, comment and work on their own designs. */
const CLIENT: Partial<Record<Resource, readonly string[]>> = { project: ['read'], comment: ['create'], design: ['create', 'update'] }

export function can(role: string, resource: Resource, action: string): boolean {
  if (role === 'client') return !!CLIENT[resource]?.includes(action)
  const r = roles[role as Role]
  if (!r) return false
  const allowed = (r.statements as Record<string, readonly string[] | undefined>)[resource]
  return !!allowed?.includes(action)
}
