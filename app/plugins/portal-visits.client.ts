// The portal visit log, client half (server/utils/portalVisits.ts). The page the app
// opens on and every route change after it, under /member, post the page to
// /api/member/visit. The server takes the person from the session cookie and logs nothing
// for a visitor who is not signed in (the middleware's 401), so no consent is involved:
// this is the signed-in member using the system, not analytics (Snorre 2026-11-25,
// ctori-4 dc-145 H14). Fire and forget: a failure here must never reach the page.
//
// Both hooks are needed: Nuxt may finish the first navigation before this plugin's
// afterEach exists, so app:mounted sends the first page, and afterEach the rest.
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const { session } = useAuthSession()
  const checked = useState<boolean>('ctr-session-checked', () => false)
  let last = ''

  function send(path: string) {
    if (path !== '/member' && !path.startsWith('/member/')) return
    // The same page again (another query or hash, or both hooks on the first page) is
    // not a new visit. The server dedupes too; this only saves the request.
    if (path === last) return
    // Known to be signed out: nothing to log, and no 401 to provoke.
    if (checked.value && !session.value.authenticated) return
    last = path
    $fetch('/api/member/visit', { method: 'POST', body: { path } }).catch(() => {})
  }

  nuxtApp.hook('app:mounted', () => send(router.currentRoute.value.path))
  router.afterEach((to, _from, failure) => {
    if (!failure) send(to.path)
  })
})
