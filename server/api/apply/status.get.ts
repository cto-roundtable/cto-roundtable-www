// GET /api/apply/status: is admission to the Norwegian network open right now (hq 050,
// network_groups.admission_status). Public, one word. Closed still takes applications.
export default defineCachedEventHandler(
  async () => ({ status: (await admissionStatusOf('cto-roundtable')) ?? 'open' }),
  { maxAge: 30, name: 'apply-status', getKey: () => 'apply-status' },
)
