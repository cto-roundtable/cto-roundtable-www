<template>
  <v-app>
    <!-- Loading -->
    <v-main v-if="loading || !localeReady" class="member-layout">
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
        :aria-label="t('layout.homeAria')"
        style="position: absolute; top: 16px; left: 16px; z-index: 10;"
      >
        <v-icon color="white">mdi-home</v-icon>
      </v-btn>
      <div style="position: absolute; top: 16px; right: 16px; z-index: 10;">
        <MemberLocaleSwitcher />
      </div>

      <div class="login-section text-center" style="max-width: 420px; margin: 0 auto; padding: 80px 24px 40px;">
        <h1 class="font-weight-bold mb-4">{{ t('auth.login.title') }}</h1>
        <p class="text-muted mb-6">
          {{ t('auth.login.intro') }}
        </p>

        <v-alert
          v-if="error"
          type="warning"
          variant="outlined"
          class="mb-4 text-left"
        >
          <span v-if="error === 'expired'">{{ t('auth.login.errorExpired') }}</span>
          <span v-else-if="error === 'invalid'">{{ t('auth.login.errorInvalid') }}</span>
          <span v-else-if="error === 'passkey'">{{ t('auth.login.errorPasskey') }}</span>
          <span v-else>{{ t('auth.login.errorUnknown') }}</span>
        </v-alert>

        <!-- Passkey: an option next to the email link, only where the browser can do it.
             The card is shown before we know who is signing in, so it follows the browser
             language (useMemberLocale), English when the browser names none of ours. -->
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
            {{ t('auth.login.passkeyButton') }}
          </v-btn>
          <div class="login-or">{{ t('auth.login.orEmail') }}</div>
        </template>

        <form @submit.prevent="submitMagicLink">
          <v-text-field
            v-model="email"
            :label="t('auth.login.emailLabel')"
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
            {{ t('auth.login.sendLink') }}
          </v-btn>
          <v-alert v-if="sent" type="success" variant="outlined" class="text-left">
            {{ t('auth.login.sent') }}
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
          :aria-label="t('layout.menuAria')"
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
        <!-- On a phone the bar has no room: the switcher sits in the drawer instead. -->
        <MemberLocaleSwitcher v-if="!mobile" class="mr-1" />
        <v-btn
          variant="text"
          size="small"
          style="color: #999;"
          @click="logout"
        >
          {{ t('auth.signOut') }}
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
            {{ t('layout.signedInAs') }}
          </p>
          <p class="font-weight-bold mb-0" style="color: #fff; font-size: 15px; line-height: 1.3;">
            {{ session.name }}
          </p>
          <MemberLocaleSwitcher v-if="mobile" class="mt-2 ml-n2" />
        </div>

        <v-list nav density="comfortable" color="white">
          <template v-for="item in navItems" :key="item.to">
            <v-list-item
              :to="item.to"
              :exact="item.exact"
              :prepend-icon="item.icon"
              :title="item.title"
              :active="item.active"
              @click="mobile && (drawer = false)"
            />
            <!-- Sub-items (Caser for the committee): always shown, indented under their parent. -->
            <v-list-item
              v-for="sub in item.children ?? []"
              :key="sub.key"
              :to="sub.to"
              :title="sub.title"
              :active="sub.active"
              density="compact"
              class="nav-sub"
              @click="mobile && (drawer = false)"
            />
          </template>
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
              {{ t('layout.passkeyNudge.body') }}
              <NuxtLink to="/member/security" style="color: inherit; font-weight: 600;">{{ t('layout.passkeyNudge.link') }}</NuxtLink>
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
const { t, locale } = useI18n()
const { applyDefault: applyLocale } = useMemberLocale()
// Hold the spinner until the language is set, so a Swedish member never sees a flash of Norwegian.
const localeReady = ref(false)

// The page html lang follows the portal language, so screen readers and the
// browser's own translate offer read it right.
useHead({ htmlAttrs: { lang: locale } })

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

// Titles are message keys, resolved in navItems so they follow a language switch.
const baseNavItems = [
  { to: '/member', key: 'nav.overview', icon: 'mdi-view-dashboard-outline', exact: true },
  { to: '/member/host', key: 'nav.hosting', icon: 'mdi-silverware-fork-knife', exact: false },
  { to: '/member/jobb', key: 'nav.openToWork', icon: 'mdi-briefcase-search-outline', exact: false },
  { to: '/member/min-aktivitet', key: 'nav.myActivity', icon: 'mdi-chart-line', exact: false },
  { to: '/member/discounts', key: 'nav.discounts', icon: 'mdi-tag-multiple-outline', exact: false },
  { to: '/member/surveys', key: 'nav.surveys', icon: 'mdi-clipboard-text-outline', exact: false },
  { to: '/member/onboarding', key: 'nav.aiOnboarding', icon: 'mdi-robot-outline', exact: false },
  { to: '/member/security', key: 'nav.signIn', icon: 'mdi-fingerprint', exact: false },
  { to: '/member/faq', key: 'nav.faq', icon: 'mdi-help-circle-outline', exact: false },
]

// Role-scoped links, shown only when the session says so. The pages and their
// APIs are independently RBAC-gated, so hiding a link is just UX.
// The Swedish chapter's own nav (decision sweden-portal-scope): its own overview
// and FAQ, everything shared with Norway except AI onboarding, which stays
// Norwegian (and is refused server-side, server/utils/chapter.ts).
const swedenNavItems = [
  { to: '/member/sweden', key: 'nav.overview', icon: 'mdi-view-dashboard-outline', exact: true },
  { to: '/member/surveys', key: 'nav.surveys', icon: 'mdi-clipboard-text-outline', exact: false },
  { to: '/member/discounts', key: 'nav.discounts', icon: 'mdi-tag-multiple-outline', exact: false },
  { to: '/member/host', key: 'nav.hosting', icon: 'mdi-silverware-fork-knife', exact: false },
  { to: '/member/jobb', key: 'nav.openToWork', icon: 'mdi-briefcase-search-outline', exact: false },
  { to: '/member/min-aktivitet', key: 'nav.myActivity', icon: 'mdi-chart-line', exact: false },
  { to: '/member/security', key: 'nav.signIn', icon: 'mdi-fingerprint', exact: false },
  { to: '/member/sweden/faq', key: 'nav.faq', icon: 'mdi-help-circle-outline', exact: false },
]

// Only in the Swedish chapter (not also in the Norwegian one): the Swedish area.
const swedenOnly = computed(() => {
  const chapters = session.value.chapters ?? []
  return chapters.includes('se') && !chapters.includes('no')
})

const navItems = computed(() => {
  const chapters = session.value.chapters ?? []
  const items: NavItem[] = swedenOnly.value ? [...swedenNavItems] : [...baseNavItems]
  // In both chapters (the Stockholm host): the Norwegian portal plus the Swedish area.
  if (!swedenOnly.value && chapters.includes('se')) {
    items.splice(1, 0, { to: '/member/sweden', key: 'nav.sweden', icon: 'mdi-map-marker-outline', exact: false })
  }
  // Cases (deal votes): an SPV member who can see a case, or the committee. Caser always
  // opens on what a member sees; the committee gets its own view and the role preview
  // as sub-items (Snorre, 2026-10-29). The board gets nothing extra here.
  if (session.value.canSeeCases) {
    items.push({
      to: '/member/caser',
      key: 'nav.deals',
      icon: 'mdi-briefcase-check-outline',
      exact: false,
      children: casesChildren.value,
    })
  }
  // CTORI signup: the open offering, for every member in either chapter (D6).
  if (session.value.investOffering) {
    items.push({
      to: `/member/invest/${session.value.investOffering.slug}`,
      key: 'nav.invest',
      icon: 'mdi-hand-coin-outline',
      exact: false,
    })
  }
  // Investor-updates: any member of an investment cohort (invest-*).
  if (session.value.isInvestor) {
    items.push({ to: '/member/updates', key: 'nav.investorUpdates', icon: 'mdi-finance', exact: false })
  }
  if (session.value.isBoard) {
    items.push({ to: '/member/board', key: 'nav.boardMeetings', icon: 'mdi-gavel', exact: false })
    items.push({ to: '/member/activity', key: 'nav.boardActivity', icon: 'mdi-pulse', exact: false })
  }
  return items.map(({ key, children, ...item }: NavItem) => ({
    ...item,
    // A parent with sub-items is never the highlighted row: the sub-item is.
    active: children?.length ? false : undefined,
    title: t(key),
    children: children?.map((c) => ({ ...c, title: t(c.key) })),
  }))
})

interface NavSub {
  to: string | { path: string; query?: Record<string, string> }
  key: string
  active: boolean
}
interface NavItem {
  to: string
  key: string
  icon: string
  exact: boolean
  children?: NavSub[]
}

// Under Caser, for the committee only: the member view (default), the committee's
// view, and "Se som ..." (the overview as a role sees it; `aktiv` = the SPV investing now).
const casesChildren = computed<NavSub[] | undefined>(() => {
  if (!session.value.isCommittee) return undefined
  const onCases = route.path.startsWith('/member/caser')
  const previewing = onCases && typeof route.query.som === 'string' && route.query.som !== ''
  return [
    { to: '/member/caser', key: 'nav.dealsMember', active: onCases && !previewing },
    { to: '/member/komite', key: 'nav.dealsCommittee', active: route.path.startsWith('/member/komite') },
    { to: { path: '/member/caser', query: { som: 'aktiv' } }, key: 'nav.dealsPreview', active: previewing },
  ]
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

/**
 * Conditional UI: the browser offers saved passkeys in the email field's autofill.
 * Its challenge lives 5 minutes, but the request can wait much longer for the
 * member to pick a passkey, so: a 401 (most likely an expired challenge) restarts
 * it once with a fresh challenge before showing an error, and coming back to a
 * tab whose request is older than 4 minutes refreshes it.
 */
let autofillRun = 0
let autofillStartedAt = 0

async function startPasskeyAutofill(retried = false) {
  if (session.value.authenticated || !(await browserSupportsWebAuthnAutofill())) return
  await nextTick() // the email field (autocomplete="... webauthn") must be in the DOM
  const run = ++autofillRun
  autofillStartedAt = Date.now()
  try {
    await loginWithPasskey(true)
  } catch (err: any) {
    if (run !== autofillRun) return // superseded by a newer request
    if (err?.statusCode === 401 && !retried) startPasskeyAutofill(true)
    else error.value = 'passkey'
  } finally {
    if (run === autofillRun) autofillStartedAt = 0
  }
}

function refreshStalePasskeyAutofill() {
  const stale = autofillStartedAt && Date.now() - autofillStartedAt > 4 * 60 * 1000
  if (document.visibilityState === 'visible' && stale) startPasskeyAutofill()
}

// Members without a passkey are offered one: right after a magic-link sign-in
// (?via=link) as an onboarding step on /member/security, otherwise as a
// dismissible nudge above the page. "Ikke nå" / closing the nudge stops both on
// this browser. Shared state, so /member/security can hide the nudge the moment
// a passkey is added.
const NUDGE_DISMISSED_KEY = 'ctr-passkey-nudge-dismissed'
const passkeyNudge = useState<boolean>('ctr-passkey-nudge', () => false)
const showPasskeyNudge = computed(() => passkeyNudge.value && route.path !== '/member/security')

let nudgeChecked = false

async function checkPasskeyNudge() {
  if (nudgeChecked || !passkeySupported.value || localStorage.getItem(NUDGE_DISMISSED_KEY)) return
  nudgeChecked = true
  try {
    const passkeys = await $fetch<unknown[]>('/api/auth/passkey/credentials')
    if (passkeys.length > 0) return
    if (route.query.via === 'link') {
      await navigateTo('/member/security?onboarding=1', { replace: true })
    } else {
      passkeyNudge.value = true
    }
  } catch {
    passkeyNudge.value = false
  }
}

function dismissPasskeyNudge() {
  passkeyNudge.value = false
  localStorage.setItem(NUDGE_DISMISSED_KEY, '1')
}

// A Swedish-only member who lands on a Norwegian page (a bookmark, the magic
// link's /member) goes to the Swedish counterpart instead.
const SWEDEN_REDIRECTS: Record<string, string> = {
  '/member': '/member/sweden',
  '/member/faq': '/member/sweden/faq',
  '/member/onboarding': '/member/sweden',
}
watch(
  [swedenOnly, () => route.path],
  ([only, path]) => {
    const target = only ? SWEDEN_REDIRECTS[path.replace(/\/$/, '') || '/member'] : undefined
    if (target) navigateTo({ path: target, query: route.query }, { replace: true })
  },
  { immediate: true },
)

watch(
  () => session.value.authenticated,
  (authenticated) => {
    applyLocale(session.value)
    if (authenticated) checkPasskeyNudge()
    else {
      passkeyNudge.value = false
      nudgeChecked = false
      if (passkeySupported.value) startPasskeyAutofill() // signed out: offer autofill again
    }
  },
)

onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshStalePasskeyAutofill))

onMounted(async () => {
  document.addEventListener('visibilitychange', refreshStalePasskeyAutofill)
  passkeySupported.value = browserSupportsWebAuthn()
  await checkSession()
  await applyLocale(session.value)
  localeReady.value = true
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

/* Sub-items sit under their parent's title, not under its icon. */
.member-drawer .nav-sub {
  padding-inline-start: 56px !important;
  min-height: 36px !important;
  font-size: 14px;
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
