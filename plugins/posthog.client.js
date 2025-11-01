import posthog from 'posthog-js'

export default function ({ app }, inject) {
  const posthogToken = process.env.posthogToken
  const posthogHost = process.env.posthogHost || 'https://eu.i.posthog.com'

  // Only initialize PostHog if token is provided
  if (posthogToken) {
    posthog.init(posthogToken, {
      api_host: posthogHost,
      capture_pageview: false, // We'll manually capture pageviews via router
      capture_pageleave: true,
      autocapture: true,
      loaded: (posthog) => {
        // Enable debug mode in development
        if (process.env.NODE_ENV === 'development') {
          posthog.debug()
        }
      }
    })

    // Inject PostHog into the app context
    inject('posthog', posthog)

    // Track page views on route changes
    app.router.afterEach((to) => {
      posthog.capture('$pageview', {
        $current_url: to.fullPath
      })
    })
  } else {
    console.warn('PostHog token not found. Analytics disabled.')
    // Inject a no-op PostHog object to prevent errors
    inject('posthog', {
      capture: () => {},
      identify: () => {},
      reset: () => {}
    })
  }
}

