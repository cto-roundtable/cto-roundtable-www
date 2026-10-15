// GET /api/admin/whoami
// Which token this is, who answers for it and what it may do. Needs no scope:
// any token that passes the gate may ask about itself. `ctr whoami`.
export default defineAdminRoute({
  GET: {
    scope: null,
    handler: (_event, caller) => ({
      token: {
        id: caller.tokenId,
        name: caller.tokenName,
        scopes: caller.scopes,
        createdAt: caller.createdAt,
        expiresAt: caller.expiresAt,
        lastUsedAt: caller.lastUsedAt,
      },
      owner: { id: caller.ownerPersonId, name: caller.ownerName },
    }),
  },
})
