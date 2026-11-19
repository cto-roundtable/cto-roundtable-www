// GET /api/apply/status: is admission to the Norwegian network open right now (hq 050,
// network_groups.admission_status). Public, one word. Closed still takes applications.
// 404 while the admissions flag is off (server/utils/admissionsFlag.ts), so /bli-medlem is too.
export default defineEventHandler(async () => {
  requireAdmissions(false, 'read')
  return { status: (await admissionStatusOf('cto-roundtable')) ?? 'open' }
})
