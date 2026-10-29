/**
 * The label of a role in the "Se som ..." preview: a member of one SPV (with where
 * that SPV is: investing now, done, raising) or a member in no SPV.
 */
export function roleLabel(
  t: (key: string, params?: Record<string, unknown>) => string,
  role: { slug: string; name: string | null; phase: string | null },
): string {
  if (!role.name) return t('deals.preview.role.none')
  const phase = role.phase && ['deploying', 'completed', 'raising'].includes(role.phase) ? role.phase : 'other'
  return t(`deals.preview.role.${phase}`, { group: role.name })
}
