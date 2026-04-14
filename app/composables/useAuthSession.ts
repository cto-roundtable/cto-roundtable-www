interface Session {
  authenticated: boolean
  name?: string
  personId?: string
}

export function useAuthSession() {
  const session = useState<Session>('ctr-session', () => ({ authenticated: false }))
  const loading = useState<boolean>('ctr-session-loading', () => true)
  const checked = useState<boolean>('ctr-session-checked', () => false)

  async function checkSession() {
    if (checked.value) return
    try {
      const data = await $fetch<Session>('/api/auth/session')
      session.value = data
    } catch {
      session.value = { authenticated: false }
    } finally {
      loading.value = false
      checked.value = true
    }
  }

  async function requestMagicLink(email: string) {
    await $fetch('/api/auth/request', { method: 'POST', body: { email } })
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    session.value = { authenticated: false }
    await navigateTo('/member')
  }

  return { session, loading, checked, checkSession, requestMagicLink, logout }
}
