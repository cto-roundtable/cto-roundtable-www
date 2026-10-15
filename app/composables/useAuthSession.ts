import { startAuthentication } from '@simplewebauthn/browser'

interface Session {
  authenticated: boolean
  name?: string
  personId?: string
  email?: string
  isBoard?: boolean
  isInvestor?: boolean
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
      if (import.meta.client && data.authenticated && data.personId) {
        const { $posthog } = useNuxtApp()
        $posthog?.identify?.(data.personId, { name: data.name, email: data.email })
      }
    } catch {
      session.value = { authenticated: false }
    } finally {
      loading.value = false
      checked.value = true
    }
  }

  /** Re-read the session from the server, e.g. after signing in without a page load. */
  async function refreshSession() {
    checked.value = false
    await checkSession()
  }

  /**
   * Sign in with a passkey (server/api/auth/passkey/login). Resolves true when
   * signed in, false when the member cancelled or another ceremony took over
   * (e.g. the button aborting the autofill one); throws when the server says no.
   * With useBrowserAutofill the browser offers passkeys in the email field's
   * autofill (conditional UI) instead of opening a dialog.
   */
  async function loginWithPasskey(useBrowserAutofill = false): Promise<boolean> {
    const optionsJSON = await $fetch<any>('/api/auth/passkey/login/options', { method: 'POST' })
    let response: Awaited<ReturnType<typeof startAuthentication>>
    try {
      response = await startAuthentication({ optionsJSON, useBrowserAutofill })
    } catch (err: any) {
      const name = err?.cause?.name || err?.name
      if (name === 'NotAllowedError' || name === 'AbortError' || err?.code === 'ERROR_CEREMONY_ABORTED') return false
      throw err
    }
    await $fetch('/api/auth/passkey/login/verify', { method: 'POST', body: { response } })
    await refreshSession()
    return true
  }

  async function requestMagicLink(email: string) {
    await $fetch('/api/auth/request', { method: 'POST', body: { email } })
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    session.value = { authenticated: false }
    if (import.meta.client) {
      const { $posthog } = useNuxtApp()
      $posthog?.reset?.()
    }
    await navigateTo('/member')
  }

  return { session, loading, checked, checkSession, refreshSession, loginWithPasskey, requestMagicLink, logout }
}
