// The admissions flag on the client (server/utils/admissionsFlag.ts): the server
// sends it on /api/auth/session. `visible`: may this viewer see admissions at all
// (on, or styret looking while it is off). `preview`: styret looking while it is off.
export function useAdmissionsFlag() {
  const { session } = useAuthSession()
  const enabled = computed(() => session.value.admissionsEnabled === true)
  const visible = computed(() => enabled.value || session.value.isBoard === true)
  const preview = computed(() => !enabled.value && session.value.isBoard === true)
  return { enabled, visible, preview }
}
