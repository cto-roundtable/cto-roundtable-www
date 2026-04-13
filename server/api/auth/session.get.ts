export default defineEventHandler((event) => {
  const session = verifySession(event)

  if (!session) {
    return { authenticated: false }
  }

  return {
    authenticated: true,
    name: session.name,
    personId: session.personId,
  }
})
