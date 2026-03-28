export default defineNuxtConfig({
  compatibilityDate: '2026-03-28',

  app: {
    head: {
      titleTemplate: '%s - CTO Roundtable Invest',
      title: 'CTO Roundtable Invest',
      htmlAttrs: {
        lang: 'en',
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
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Work+Sans:wght@300;400;500;600&display=swap',
        },
      ],
    },
  },

  modules: ['vuetify-nuxt-module', '@nuxt/image'],

  vuetify: {
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
    public: {
      membersToken: process.env.CODA_MEMBERS_TOKEN || '',
      portfolioToken: process.env.CODA_PORTFOLIO_COMPANIES || '',
      posthogToken: process.env.POSTHOG_TOKEN || '',
      posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
    },
  },

  nitro: {
    output: {
      publicDir: 'dist',
    },
  },
})
