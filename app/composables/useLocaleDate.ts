// Dates in the member portal, in the active language. One place, so every page formats
// the same way: nb-NO, en-GB or sv-SE, always in Oslo time (Stockholm is the same zone).

const TAGS: Record<string, string> = { nb: 'nb-NO', en: 'en-GB', sv: 'sv-SE' }

export function useLocaleDate() {
  const { locale } = useI18n()
  const tag = computed(() => TAGS[locale.value] ?? 'nb-NO')

  /** `long`: 3. oktober 2026. `short`: 3. okt. 2026. */
  function formatDate(value: string | number | Date | null | undefined, style: 'long' | 'short' = 'long') {
    if (value === null || value === undefined || value === '') return ''
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(tag.value, {
      year: 'numeric',
      month: style,
      day: 'numeric',
      timeZone: 'Europe/Oslo',
    })
  }

  /** Any other Intl date format, in the active language and Oslo time. */
  function format(value: string | number | Date, options: Intl.DateTimeFormatOptions) {
    return new Date(value).toLocaleString(tag.value, { timeZone: 'Europe/Oslo', ...options })
  }

  return { tag, formatDate, format }
}
