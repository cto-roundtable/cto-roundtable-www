// Which language the member portal speaks. In order:
//   1. the member's own choice from the switcher (cookie ctr_locale, a year)
//   2. after sign-in, their chapter: only the Swedish chapter -> sv, otherwise nb
//   3. before sign-in (the login card), the browser's Accept-Language; English when it
//      names none of ours, since the card was English before there was a choice
// The cookie is only written by an explicit choice, so a member who never picks keeps
// following their chapter.

export type MemberLocale = 'nb' | 'en' | 'sv'

const LOCALES: MemberLocale[] = ['nb', 'en', 'sv']
const COOKIE = 'ctr_locale'

function fromLanguageTags(tags: readonly string[]): MemberLocale | null {
  for (const tag of tags) {
    const base = tag.trim().toLowerCase().split(/[-_;]/)[0]
    if (base === 'nb' || base === 'no' || base === 'nn') return 'nb'
    if (base === 'sv') return 'sv'
    if (base === 'en') return 'en'
  }
  return null
}

export function useMemberLocale() {
  const { locale, setLocale } = useI18n()
  const chosen = useCookie<MemberLocale | null>(COOKIE, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })
  const headers = useRequestHeaders(['accept-language'])

  function browserLocale(): MemberLocale | null {
    if (import.meta.client) return fromLanguageTags(navigator.languages ?? [navigator.language])
    return fromLanguageTags((headers['accept-language'] ?? '').split(','))
  }

  /** Apply the right language for the current session state. */
  async function applyDefault(session: { authenticated: boolean; chapters?: string[] }) {
    let next: MemberLocale
    if (chosen.value && LOCALES.includes(chosen.value)) next = chosen.value
    else if (session.authenticated) {
      const chapters = session.chapters ?? []
      next = chapters.includes('se') && !chapters.includes('no') ? 'sv' : 'nb'
    } else next = browserLocale() ?? 'en'
    if (locale.value !== next) await setLocale(next)
  }

  /** The member picked a language in the switcher. */
  async function choose(next: MemberLocale) {
    chosen.value = next
    await setLocale(next)
  }

  return { locale, locales: LOCALES, applyDefault, choose }
}
