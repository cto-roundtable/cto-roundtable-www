// Sweden admission votes on the client (server/utils/admissionsFlag.ts, Sweden's switch):
// the server sends `swedenAdmission` on /api/auth/session. `visible`: may this viewer see
// them at all (on and a voter or manager, or a manager looking while it is off).
// `preview`: a manager looking while it is off. The server decides; this only picks the nav.
export function useSwedenAdmissionFlag() {
  const { session } = useAuthSession()
  const state = computed(() => session.value.swedenAdmission ?? null)
  const enabled = computed(() => state.value?.enabled === true)
  const isManager = computed(() => state.value?.isManager === true)
  const isVoter = computed(() => state.value?.isVoter === true)
  const visible = computed(() => isManager.value || (enabled.value && isVoter.value))
  const preview = computed(() => !enabled.value && isManager.value)
  return { enabled, isManager, isVoter, visible, preview }
}
