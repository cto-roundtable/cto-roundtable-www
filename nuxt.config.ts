export default defineNuxtConfig({
  compatibilityDate: '2026-03-28',

  app: {
    head: {
      // titleTemplate is set in app.vue (a function, which nuxt.config can't serialize)
      title: 'CTO Roundtable',
      htmlAttrs: {
        lang: 'en',
        style: 'background-color:#111',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'A Norwegian community of CTOs focused on sharing knowledge and supporting each other.',
        },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      style: [
        {
          innerHTML: `
            .v-application { display: flex }
            .v-application__wrap { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 100dvh }
            .v-main { flex: 1 0 auto; transition: none }
            .landing-page { background-color: #111; color: #fff; min-height: 100vh }
          `,
        },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Work+Sans:wght@300;400;500;600&display=optional',
        },
      ],
    },
  },

  css: ['vuetify/dist/vuetify.min.css'],

  modules: ['vuetify-nuxt-module', '@nuxt/image'],

  vuetify: {
    moduleOptions: {
      styles: 'none',
    },
    vuetifyOptions: {
      theme: {
        defaultTheme: 'light',
        themes: {
          light: {
            colors: {
              background: '#111111',
            },
          },
        },
      },
    },
  },

  image: {},

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',
    ingestApiKey: process.env.INGEST_API_KEY || '',
    // GCS bucket holding raw investor-update emails + attachments (EU region).
    // Read via ADC (the Cloud Run service account) to stream attachments to
    // authorised members. Empty locally unless you have gcloud ADC + the bucket.
    gcsInvestorUpdatesBucket: process.env.GCS_INVESTOR_UPDATES_BUCKET || '',
    // GCS bucket holding issued styreprotokoller (EU region). Separate from the
    // investor-updates bucket on purpose: these are permanent records of the
    // association, and the investor-updates ingest identity has objectAdmin on
    // its own bucket. Read AND written via ADC by the Cloud Run service account.
    gcsBoardProtocolsBucket: process.env.GCS_BOARD_PROTOCOLS_BUCKET || '',
    // Canonical public origin for magic-link URLs. Set on the server via
    // NUXT_SITE_URL (Cloud Run); left empty locally so dev falls back to the
    // request origin. Never derive auth link hosts from the request Host header.
    siteUrl: process.env.NUXT_SITE_URL || process.env.SITE_URL || '',
    public: {
      posthogToken: process.env.POSTHOG_TOKEN || '',
      posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
    },
  },

  nitro: {},
})
