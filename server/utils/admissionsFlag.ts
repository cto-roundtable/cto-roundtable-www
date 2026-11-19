// The admissions feature flag (Snorre, 2026-11-19): admission votes ship dark and a
// flag decides whether members see them. The first flag in this repo, kept to one
// small file so the next one can copy it:
//   - runtimeConfig.admissionsEnabled, from env NUXT_ADMISSIONS_ENABLED (Cloud Run,
//     infrastructure/tofu/main.tf), default off. Read per request, never at build.
//   - isFlagOn(): the pure parse ('true', '1', 'on', 'yes', or a boolean true).
//   - admissionAccess(): the pure policy, pinned by tests/unit/admissions-flag.test.ts.
//   - requireAdmissions(): what every admission route calls first.
// The client reads the same flag from /api/auth/session (`admissionsEnabled`),
// through app/composables/useAdmissionsFlag.ts.

export function isFlagOn(raw: unknown): boolean {
  if (raw === true) return true
  if (typeof raw !== 'string') return false
  return ['true', '1', 'on', 'yes'].includes(raw.trim().toLowerCase())
}

/** Whether admissions are on in this process. */
export function admissionsEnabled(): boolean {
  return isFlagOn(useRuntimeConfig().admissionsEnabled)
}

/** 'read': see pages and data. 'act': a write that can start something real for members. */
export type AdmissionAction = 'read' | 'act' | 'manage'

export const HIDDEN_MESSAGE = 'Ikke synlig for medlemmer ennå'

/**
 * Flag on: everything as built (the routes still check board and roster themselves).
 * Flag off: 404 for everyone but styret; styret may read and 'manage' (close, cancel,
 * lot, close admission) but not 'act' (start a vote, open admission, cast a ballot):
 * 409 with HIDDEN_MESSAGE, so nothing real can happen by accident.
 */
export function admissionAccess(enabled: boolean, isBoard: boolean, action: AdmissionAction): 200 | 404 | 409 {
  if (enabled) return 200
  if (!isBoard) return 404
  return action === 'act' ? 409 : 200
}

/** The first line of every admission route. */
export function requireAdmissions(isBoard: boolean, action: AdmissionAction) {
  const status = admissionAccess(admissionsEnabled(), isBoard, action)
  if (status === 404) throw createError({ statusCode: 404, message: 'Not found' })
  if (status === 409) throw createError({ statusCode: 409, message: HIDDEN_MESSAGE })
}
