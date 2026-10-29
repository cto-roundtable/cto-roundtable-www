<template>
  <div class="member-device text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-1" style="font-size: 1.6rem;">{{ t('member.device.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        {{ t('member.device.intro') }}
      </p>
    </header>

    <v-alert v-if="checked && !session.isBoard" type="info" variant="outlined" class="text-left">
      {{ t('member.device.boardOnly') }}
    </v-alert>

    <template v-else-if="checked">
      <!-- Decided: nothing more to do here. -->
      <v-alert v-if="done" :type="done === 'approved' ? 'success' : 'info'" variant="outlined" class="text-left">
        {{ done === 'approved' ? t('member.device.approved') : t('member.device.denied') }}
      </v-alert>

      <template v-else>
        <form v-if="!request" class="mb-4" style="max-width: 360px;" @submit.prevent="lookup">
          <v-text-field
            v-model="code"
            :label="t('member.device.codeLabel')"
            placeholder="ABCD-EFGH"
            variant="outlined"
            density="comfortable"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="12"
            hide-details="auto"
            class="mb-3 device-code-input"
          />
          <v-btn type="submit" :loading="busy === 'lookup'" block style="background-color: white; color: #111;">
            {{ t('member.device.find') }}
          </v-btn>
        </form>

        <v-card v-else variant="outlined" class="pa-4 mb-4" style="max-width: 560px;">
          <dl class="device-facts">
            <dt>{{ t('member.device.request.code') }}</dt>
            <dd class="mono">{{ request.userCode }}</dd>
            <dt>{{ t('member.device.request.client') }}</dt>
            <dd>{{ request.clientName }}</dd>
            <dt>{{ t('member.device.request.ip') }}</dt>
            <dd class="mono">{{ request.requestedIp || t('member.device.request.ipUnknown') }}</dd>
            <dt>{{ t('member.device.request.expires') }}</dt>
            <dd>{{ format(request.expiresAt, { hour: '2-digit', minute: '2-digit' }) }}</dd>
            <dt>{{ t('member.device.request.scopes') }}</dt>
            <dd>
              <ul class="device-scopes">
                <li v-for="s in request.scopes" :key="s">
                  {{ scopeLabel(s) }}
                  <span class="mono scope-id">{{ s }}</span>
                </li>
              </ul>
            </dd>
          </dl>

          <template v-if="request.status === 'pending'">
            <p class="mt-4 mb-4" style="color: #ccc; font-size: 14px; line-height: 1.6;">
              {{ t('member.device.tokenNote', { days: TOKEN_DAYS }) }}
            </p>
            <v-alert v-if="!request.recentSignIn" type="warning" variant="outlined" class="text-left mb-4">
              {{ t('member.device.reauth') }}
              <div class="d-flex ga-2 flex-wrap mt-3">
                <v-btn
                  v-if="passkeySupported"
                  :loading="busy === 'stepup'"
                  prepend-icon="mdi-fingerprint"
                  style="background-color: white; color: #111;"
                  @click="confirmWithPasskey"
                >
                  {{ t('member.device.confirmWithPasskey') }}
                </v-btn>
                <v-btn size="small" variant="outlined" color="white" class="align-self-center" @click="signOutHere">
                  {{ t('member.device.signOutAndIn') }}
                </v-btn>
              </div>
            </v-alert>
            <v-alert
              v-if="request.needsCommittee && !request.approverOnCommittee"
              type="warning"
              variant="outlined"
              class="text-left mb-4"
            >
              {{ t('member.device.committeeOnly') }}
            </v-alert>
            <div class="d-flex ga-3 flex-wrap">
              <v-btn
                :disabled="!request.recentSignIn || (request.needsCommittee && !request.approverOnCommittee)"
                :loading="busy === 'approve'"
                size="large"
                style="background-color: white; color: #111;"
                @click="decide('approve')"
              >
                {{ t('member.device.approve') }}
              </v-btn>
              <v-btn
                :loading="busy === 'deny'"
                size="large"
                variant="outlined"
                color="white"
                @click="decide('deny')"
              >
                {{ t('member.device.deny') }}
              </v-btn>
            </div>
          </template>
          <v-alert v-else type="info" variant="outlined" class="text-left mt-4">
            {{ request.status === 'expired' ? t('member.device.errors.expired') : t('member.device.errors.decided') }}
          </v-alert>
        </v-card>

        <v-alert v-if="error" type="warning" variant="outlined" class="text-left" style="max-width: 560px;">
          {{ error }}
        </v-alert>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'

// The approve page of the device flow (decision device-flow-rust.md):
// `ctr login` prints a code and a link here (?code= prefills). A styret
// member checks what is asking and approves or denies. Approve needs a sign-in
// from the last 10 minutes; the server enforces it, the page only explains it.
// The member layout shows the sign-in card until there is a session, and a
// passkey sign-in stays on this URL, so ?code= survives it. An older sign-in
// gets "Bekreft med passkey": a full passkey sign-in in place (the same
// login/options + verify ceremony, so a fresh session), then the lookup again.

definePageMeta({ layout: 'member' })

interface DeviceRequest {
  userCode: string
  clientName: string
  scopes: string[]
  requestedIp: string | null
  status: 'pending' | 'approved' | 'denied' | 'consumed' | 'expired'
  createdAt: string
  expiresAt: string
  recentSignIn: boolean
  /** a scope only a committee member may grant (deals:read, comments:read, qa:read) */
  needsCommittee: boolean
  approverOnCommittee: boolean
}

/** DEVICE_TOKEN_TTL_DAYS in server/utils/deviceAuth.ts. */
const TOKEN_DAYS = 90

const route = useRoute()
const { t } = useI18n()
const { format } = useLocaleDate()
const { session, checked, loginWithPasskey } = useAuthSession()

const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const request = ref<DeviceRequest | null>(null)
const busy = ref<'' | 'lookup' | 'approve' | 'deny' | 'stepup'>('')
const error = ref('')
const done = ref<'' | 'approved' | 'denied'>('')
// Decided on the client only: WebAuthn support is a browser fact, and SSR has none.
const passkeySupported = ref(false)

const SCOPE_KEYS: Record<string, string> = {
  'events:read': 'eventsRead',
  'events:write': 'eventsWrite',
  'surveys:read': 'surveysRead',
  'surveys:write': 'surveysWrite',
}

function scopeLabel(scope: string): string {
  const key = SCOPE_KEYS[scope]
  return key ? t(`member.device.scopes.${key}`) : scope
}

function errorText(err: any): string {
  const status = err?.statusCode ?? err?.response?.status
  const reason = err?.data?.code
  if (status === 400) return t('member.device.errors.invalid')
  if (status === 404) return t('member.device.errors.notFound')
  if (status === 410 || reason === 'expired') return t('member.device.errors.expired')
  if (status === 409) return t('member.device.errors.decided')
  if (reason === 'reauth') return t('member.device.reauth')
  if (reason === 'committee') return t('member.device.committeeOnly')
  return t('member.device.errors.generic')
}

async function lookup() {
  if (!code.value.trim()) return
  busy.value = 'lookup'
  error.value = ''
  try {
    request.value = await $fetch<DeviceRequest>('/api/auth/device/lookup', { query: { code: code.value } })
  } catch (err) {
    request.value = null
    error.value = errorText(err)
  } finally {
    busy.value = ''
  }
}

async function decide(action: 'approve' | 'deny') {
  if (!request.value) return
  busy.value = action
  error.value = ''
  try {
    await $fetch(`/api/auth/device/${action}`, { method: 'POST', body: { user_code: request.value.userCode } })
    done.value = action === 'approve' ? 'approved' : 'denied'
  } catch (err: any) {
    error.value = errorText(err)
    if (err?.data?.code === 'reauth') request.value.recentSignIn = false
  } finally {
    busy.value = ''
  }
}

/**
 * Step up an older sign-in without leaving the page: sign in again with a
 * passkey (a new session, so a new iat), then look the code up again so
 * Approve unlocks. Cancelling the dialog changes nothing.
 */
async function confirmWithPasskey() {
  busy.value = 'stepup'
  error.value = ''
  try {
    if (!(await loginWithPasskey())) return
  } catch {
    error.value = t('member.device.errors.passkey')
    return
  } finally {
    busy.value = ''
  }
  await lookup()
}

/** Sign out but stay on this URL, so the layout's sign-in card comes back here with ?code=. */
async function signOutHere() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  session.value = { authenticated: false }
}

onMounted(() => {
  passkeySupported.value = browserSupportsWebAuthn()
})

watchEffect(() => {
  if (
    checked.value &&
    session.value.isBoard &&
    code.value &&
    !request.value &&
    !busy.value &&
    !error.value &&
    !done.value
  ) {
    lookup()
  }
})
</script>

<style scoped>
.member-device {
  line-height: 1.7;
}

.device-facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  font-size: 14px;
}

.device-facts dt {
  color: #999;
}

.device-facts dd {
  margin: 0;
  color: #fff;
  overflow-wrap: anywhere;
}

.device-scopes {
  list-style: none;
  padding: 0;
  margin: 0;
}

.device-scopes li + li {
  margin-top: 6px;
}

.scope-id {
  display: block;
  color: #999;
  font-size: 12px;
  line-height: 1.4;
}

.mono,
.device-code-input :deep(input) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.04em;
}
</style>
