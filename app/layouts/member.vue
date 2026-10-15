<template>
  <v-app>
    <!-- Loading -->
    <v-main v-if="loading" class="member-layout">
      <div class="d-flex justify-center align-center" style="min-height: 100vh;">
        <v-progress-circular indeterminate color="white" />
      </div>
    </v-main>

    <!-- Unauthenticated: magic-link login (centered, no sidebar) -->
    <v-main v-else-if="!session.authenticated" class="member-layout">
      <v-btn
        icon
        variant="text"
        to="/"
        class="home-icon"
        style="position: absolute; top: 16px; left: 16px; z-index: 10;"
      >
        <v-icon color="white">mdi-home</v-icon>
      </v-btn>

      <div class="login-section text-center" style="max-width: 420px; margin: 0 auto; padding: 80px 24px 40px;">
        <h1 class="font-weight-bold mb-4">Member Portal</h1>
        <p class="text-muted mb-6">
          Sign in with your membership email to access member information.
        </p>

        <v-alert
          v-if="error"
          type="warning"
          variant="outlined"
          class="mb-4 text-left"
        >
          <span v-if="error === 'expired'">
            This link has expired or has already been used. Please request a new one.
          </span>
          <span v-else-if="error === 'invalid'">
            Invalid sign-in link. Please request a new one.
          </span>
          <span v-else-if="error === 'passkey'">
            Passkey sign-in did not work. Try again, or get a sign-in link by email.
          </span>
          <span v-else>Something went wrong. Please try again.</span>
        </v-alert>

        <!-- Passkey: an option next to the email link, only where the browser can do it.
             English like the rest of this card: it is shown before we know who is signing in. -->
        <template v-if="passkeySupported">
          <v-btn
            size="large"
            block
            variant="outlined"
            color="white"
            prepend-icon="mdi-fingerprint"
            :loading="passkeyBusy"
            @click="signInWithPasskey"
          >
            Sign in with passkey
          </v-btn>
          <div class="login-or">or get a sign-in link by email</div>
        </template>

        <form @submit.prevent="submitMagicLink">
          <v-text-field
            v-model="email"
            label="Email address"
            type="email"
            autocomplete="username webauthn"
            variant="outlined"
            density="comfortable"
            :disabled="sent"
            required
          />
          <v-btn
            v-if="!sent"
            type="submit"
            size="large"
            block
            :loading="submitting"
            style="background-color: white; color: #111;"
          >
            Send sign-in link
          </v-btn>
          <v-alert v-if="sent" type="success" variant="outlined" class="text-left">
            Check your email for a sign-in link. It expires in 15 minutes.
          </v-alert>
        </form>
      </div>
    </v-main>

    <!-- Authenticated: sidebar + content -->
    <template v-else>
      <v-app-bar
        color="#111"
        density="compact"
        flat
        class="member-appbar"
      >
        <v-app-bar-nav-icon
          v-if="mobile"
          color="white"
          @click="drawer = !drawer"
        />
        <v-app-bar-title class="font-weight-bold" style="color: #fff;">
          <NuxtLink to="/" style="color: #fff; text-decoration: none;">CTO Roundtable</NuxtLink>
        </v-app-bar-title>
        <v-spacer />
        <span
          v-if="!mobile"
          class="mr-3"
          style="color: #aaa; font-size: 14px;"
        >
          {{ session.name }}
        </span>
        <v-btn
          variant="text"
          size="small"
          style="color: #999;"
          @click="logout"
        >
          Sign out
        </v-btn>
      </v-app-bar>

      <v-navigation-drawer
        v-model="drawer"
        :permanent="!mobile"
        :temporary="mobile"
        color="#0d0d0d"
        width="240"
        class="member-drawer"
      >
        <div class="pa-4" style="border-bottom: 1px solid rgba(255,255,255,0.08);">
          <p class="mb-1" style="font-size: 11px; color: #888; letter-spacing: 0.08em; text-transform: uppercase;">
            Signed in as
          </p>
          <p class="font-weight-bold mb-0" style="color: #fff; font-size: 15px; line-height: 1.3;">
            {{ session.name }}
          </p>
        </div>

        <v-list nav density="comfortable" color="white">
          <v-list-item
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :exact="item.exact"
            :prepend-icon="item.icon"
            :title="item.title"
            @click="mobile && (drawer = false)"
          />
        </v-list>
      </v-navigation-drawer>

      <v-main class="member-layout">
        <v-container fluid class="py-6 py-md-10">
          <div class="member-content">
            <v-alert
              v-if="showPasskeyNudge"
              type="info"
              variant="tonal"
              icon="mdi-fingerprint"
              closable
              class="mb-6 text-left"
              @click:close="dismissPasskeyNudge"
            >
              Slipp e-postlenken neste gang: legg til en passkey, så logger du inn med Face ID,
              fingeravtrykk eller sikkerhetsnøkkel.
              <NuxtLink to="/member/security" style="color: inherit; font-weight: 600;">Legg til under Innlogging</NuxtLink>
            </v-alert>
            <slot />
          </div>
        </v-container>
      </v-main>
    </template>
  </v-app>
</template>

<script setup lang="ts">
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser'
import { useDisplay } from 'vuetify'

const route = useRoute()
const { session, loading, checkSession, loginWithPasskey, requestMagicLink, logout } = useAuthSession()
const { mobile } = useDisplay()

const email = ref('')
const sent = ref(false)
const submitting = ref(false)
const error = ref((route.query.error as string) || '')

const drawer = ref(true)

watchEffect(() => {
  // Close drawer by default on mobile; open on desktop
  if (mobile.value) drawer.value = false
  else drawer.value = true
})

const baseNavItems = [
  { to: '/member', title: 'Oversikt', icon: 'mdi-view-dashboard-outline', exact: true },
  { to: '/member/host', title: 'Verting', icon: 'mdi-silverware-fork-knife', exact: false },
  { to: '/member/jobb', title: 'Åpen for jobb', icon: 'mdi-briefcase-search-outline', exact: false },
  { to: '/member/min-aktivitet', title: 'Min aktivitet', icon: 'mdi-chart-line', exact: false },
  { to: '/member/discounts', title: 'Fordeler', icon: 'mdi-tag-multiple-outline', exact: false },
  { to: '/member/surveys', title: 'Undersøkelser', icon: 'mdi-clipboard-text-outline', exact: false },
  { to: '/member/onboarding', title: 'AI-onboarding', icon: 'mdi-robot-outline', exact: false },
  { to: '/member/security', title: 'Innlogging', icon: 'mdi-fingerprint', exact: false },
  { to: '/member/faq', title: 'FAQ', icon: 'mdi-help-circle-outline', exact: false },
]

// Role-scoped links, shown only when the session says so. The pages and their
// APIs are independently RBAC-gated, so hiding a link is just UX.
const navItems = computed(() => {
  const items = [...baseNavItems]
  // Investor-updates: any member of an investment cohort (invest-*).
  if (session.value.isInvestor) {
    items.push({ to: '/member/updates', title: 'Investoroppdateringer', icon: 'mdi-finance', exact: false })
  }
  if (session.value.isBoard) {
    items.push({ to: '/member/board', title: 'Styremøter', icon: 'mdi-gavel', exact: false })
    items.push({ to: '/member/activity', title: 'Aktivitet (styret)', icon: 'mdi-pulse', exact: false })
  }
  return items
})

async function submitMagicLink() {
  submitting.value = true
  error.value = ''
  try {
    await requestMagicLink(email.value)
    sent.value = true
  } catch {
    error.value = 'unknown'
  } finally {
    submitting.value = false
  }
}

// --- Passkeys -----------------------------------------------------------------
// Decided on the client only: WebAuthn support is a browser fact, and SSR has none.
const passkeySupported = ref(false)
const passkeyBusy = ref(false)

async function signInWithPasskey() {
  passkeyBusy.value = true
  error.value = ''
  try {
    // Starting a new ceremony aborts the autofill one, so offer autofill again
    // if the member cancels the dialog.
    if (!(await loginWithPasskey())) startPasskeyAutofill()
  } catch {
    error.value = 'passkey'
  } finally {
    passkeyBusy.value = false
  }
}

/** Conditional UI: the browser offers saved passkeys in the email field's autofill. */
async function startPasskeyAutofill() {
  if (session.value.authenticated || !(await browserSupportsWebAuthnAutofill())) return
  await nextTick() // the email field (autocomplete="... webauthn") must be in the DOM
  try {
    await loginWithPasskey(true)
  } catch {
    error.value = 'passkey'
  }
}

// A dismissible nudge for members without a passkey. Shared state, so
// /member/security can hide it the moment one is added.
const NUDGE_DISMISSED_KEY = 'ctr-passkey-nudge-dismissed'
const passkeyNudge = useState<boolean>('ctr-passkey-nudge', () => false)
const showPasskeyNudge = computed(() => passkeyNudge.value && route.path !== '/member/security')

let nudgeChecked = false

async function checkPasskeyNudge() {
  if (nudgeChecked || !passkeySupported.value || localStorage.getItem(NUDGE_DISMISSED_KEY)) return
  nudgeChecked = true
  try {
    const passkeys = await $fetch<unknown[]>('/api/auth/passkey/credentials')
    passkeyNudge.value = passkeys.length === 0
  } catch {
    passkeyNudge.value = false
  }
}

function dismissPasskeyNudge() {
  passkeyNudge.value = false
  localStorage.setItem(NUDGE_DISMISSED_KEY, '1')
}

watch(
  () => session.value.authenticated,
  (authenticated) => {
    if (authenticated) checkPasskeyNudge()
    else {
      passkeyNudge.value = false
      nudgeChecked = false
      if (passkeySupported.value) startPasskeyAutofill() // signed out: offer autofill again
    }
  },
)

onMounted(async () => {
  passkeySupported.value = browserSupportsWebAuthn()
  await checkSession()
  if (session.value.authenticated) checkPasskeyNudge()
  else if (passkeySupported.value) startPasskeyAutofill()
})
</script>

<style>
.member-layout {
  background-color: #111;
  color: #fff;
  min-height: 100vh;
}

.member-appbar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.member-drawer {
  border-right: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.member-drawer .v-list-item {
  color: rgba(255, 255, 255, 0.75) !important;
  border-radius: 6px;
  margin-bottom: 2px;
}

.member-drawer .v-list-item:hover {
  color: #fff !important;
  background-color: rgba(255, 255, 255, 0.05) !important;
}

.member-drawer .v-list-item--active {
  color: #fff !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
}

.member-drawer .v-list-item--active .v-icon {
  color: #fff !important;
}

.member-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 4px;
}

.login-or {
  margin: 20px 0 16px;
  color: #888;
  font-size: 13px;
}

.text-muted {
  opacity: 0.8;
}
</style>
