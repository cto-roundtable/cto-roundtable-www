import posthog from 'posthog-js'

export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig()
  const posthogToken = runtimeConfig.public.posthogToken as string
  const posthogHost = (runtimeConfig.public.posthogHost as string) || 'https://eu.i.posthog.com'

  if (posthogToken) {
    posthog.init(posthogToken, {
      api_host: posthogHost,
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: true,
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

    return {
      provide: {
        posthog,
      },
    }
  } else {
    console.warn('PostHog token not found. Analytics disabled.')
    return {
      provide: {
        posthog: {
          capture: () => {},
          identify: () => {},
          reset: () => {},
        } as unknown as typeof posthog,
      },
    }
  }
})
