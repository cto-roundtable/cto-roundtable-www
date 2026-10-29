import posthog from 'posthog-js'

// Analytics consent (ekomloven § 3-15): nothing goes into the visitor's browser until they
// say yes in the banner. Before that, and after a no, PostHog runs on 'memory' persistence:
// page views are still counted, but no cookie and no local storage. The choice itself is
// remembered in local storage, which the rule allows (it is what the visitor asked for).
export type ConsentStatus = 'granted' | 'denied' | null

type PostHogPersistence = 'localStorage+cookie' | 'memory'

const CONSENT_KEY = 'ctr_analytics_consent'
const STORED: PostHogPersistence = 'localStorage+cookie'

function readConsent(): ConsentStatus {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

function writeConsent(v: ConsentStatus) {
  try {
    if (v) localStorage.setItem(CONSENT_KEY, v)
    else localStorage.removeItem(CONSENT_KEY)
  } catch {
    // storage blocked; the banner simply asks again next visit
  }
}

// What PostHog left behind before this banner existed, or before a yes was taken back.
function clearPostHogStorage() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ph_')) localStorage.removeItem(k)
  } catch {
    // ignore
  }
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim()
    if (name?.startsWith('ph_')) {
      document.cookie = `${name}=; Max-Age=0; path=/`
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname.replace(/^www\./, '')}`
    }
  }
}

export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig()
  const posthogToken = runtimeConfig.public.posthogToken as string
  const posthogHost = (runtimeConfig.public.posthogHost as string) || 'https://eu.i.posthog.com'
  const consent = ref<ConsentStatus>(readConsent())

  if (posthogToken) {
    if (consent.value !== 'granted') clearPostHogStorage()

    posthog.init(posthogToken, {
      api_host: posthogHost,
      persistence: consent.value === 'granted' ? STORED : 'memory',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: true,
      capture_exceptions: true,
      loaded: (ph) => {
        if (import.meta.dev) {
          ph.debug()
        }
      },
    })

    const router = useRouter()
    router.afterEach((to) => {
      posthog.capture('$pageview', {
        $current_url: to.fullPath,
      })
    })
  }

  function decide(v: Exclude<ConsentStatus, null>) {
    consent.value = v
    writeConsent(v)
    if (!posthogToken) return
    posthog.set_config({ persistence: v === 'granted' ? STORED : 'memory' })
    if (v === 'denied') clearPostHogStorage()
    posthog.capture('analytics_consent', { choice: v })
  }

  const analyticsConsent = {
    // The banner only makes sense where analytics actually runs.
    enabled: Boolean(posthogToken),
    status: readonly(consent),
    accept: () => decide('granted'),
    decline: () => decide('denied'),
    // "Change my choice" on the privacy page: forget it, so the banner asks again.
    reset: () => {
      consent.value = null
      writeConsent(null)
      if (!posthogToken) return
      // Unanswered means nothing stored, same as before the first answer.
      posthog.set_config({ persistence: 'memory' })
      clearPostHogStorage()
    },
  }

  if (posthogToken) {
    return { provide: { posthog, analyticsConsent } }
  }
  console.warn('PostHog token not found. Analytics disabled.')
  return {
    provide: {
      posthog: {
        capture: () => {},
        identify: () => {},
        reset: () => {},
      } as unknown as typeof posthog,
      analyticsConsent,
    },
  }
})
