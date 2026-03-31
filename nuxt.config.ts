export default defineNuxtConfig({
  compatibilityDate: '2026-03-28',

  app: {
    head: {
      titleTemplate: '%s - CTO Roundtable Invest',
      title: 'CTO Roundtable Invest',
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
          children: `
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
    public: {
      posthogToken: process.env.POSTHOG_TOKEN || '',
      posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
    },
  },

  nitro: {},
})
