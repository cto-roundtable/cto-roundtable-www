export default defineEventHandler((event) => {
  deleteCookie(event, 'ctr_session', { path: '/' })
  deleteCookie(event, 'ctr_session_sig', { path: '/' })
  return { ok: true }
})
