import { startAuthentication } from '@simplewebauthn/browser'

interface Session {
  authenticated: boolean
  name?: string
  personId?: string
  email?: string
  isBoard?: boolean
  isInvestor?: boolean
  canSeeCases?: boolean
  isCommittee?: boolean
  // The CTORI offering open for interest or tegning (a draft for the committee), or null.
  investOffering?: { slug: string; name: string } | null
  // Chapter codes (`no`, `se`) the member belongs to (server/utils/chapter.ts). They pick
  // the nav (the Swedish area for a Swedish-only member) and the default language.
  chapters?: ('no' | 'se')[]
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
   * autofill (conditional UI) instead of opening a dialog. That request starts on
   * page load, not on anything the member did, so until the browser hands back a
   * passkey the member picked, a failure (options request, a browser that refuses
   * the request) resolves false and is only logged: it must not greet a visitor
   * with an error. Only the verify step after a pick throws.
   */
  async function loginWithPasskey(useBrowserAutofill = false): Promise<boolean> {
    let response: Awaited<ReturnType<typeof startAuthentication>>
    try {
      const optionsJSON = await $fetch<any>('/api/auth/passkey/login/options', { method: 'POST' })
      response = await startAuthentication({ optionsJSON, useBrowserAutofill })
    } catch (err: any) {
      const name = err?.cause?.name || err?.name
      if (name === 'NotAllowedError' || name === 'AbortError' || err?.code === 'ERROR_CEREMONY_ABORTED') return false
      if (useBrowserAutofill) {
        console.warn('Passkey autofill not offered:', err)
        return false
      }
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
