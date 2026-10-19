<template>
  <div class="member-security text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-1" style="font-size: 1.6rem;">{{ t('member.security.title') }}</h1>
      <!-- Names the account, so a member who was signed in to someone else's
           account (e.g. by a planted link) sees it before binding a passkey. -->
      <i18n-t
        v-if="session.authenticated"
        :keypath="session.email ? 'member.security.accountWithEmail' : 'member.security.account'"
        tag="p"
        class="mb-3"
        style="color: #fff; font-size: 14px;"
      >
        <template #name><strong>{{ session.name }}</strong></template>
        <template #email>{{ session.email }}</template>
      </i18n-t>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        {{ t('member.security.intro') }}
      </p>
    </header>

    <section class="mb-10">
      <h2 class="section-title">{{ onboarding ? t('member.security.add.headingOnboarding', { name: session.name }) : t('member.security.add.heading') }}</h2>

      <v-alert v-if="supported === false" type="info" variant="outlined" class="text-left">
        {{ t('member.security.add.unsupported') }}
      </v-alert>

      <v-card v-else variant="outlined" class="pa-4">
        <p class="mb-4" style="color: #ccc; font-size: 14px; line-height: 1.6;">
          {{ t('member.security.add.storage') }}
        </p>
        <form @submit.prevent="addPasskey">
          <v-text-field
            v-model="newName"
            :label="t('member.security.add.nameLabel')"
            :placeholder="t('member.security.add.namePlaceholder')"
            variant="outlined"
            density="comfortable"
            maxlength="60"
            hide-details="auto"
            class="mb-3"
          />
          <v-btn
            type="submit"
            :loading="adding"
            size="large"
            block
            prepend-icon="mdi-fingerprint"
            style="background-color: white; color: #111;"
          >
            {{ onboarding ? t('member.security.add.submitOnboarding') : t('member.security.add.submit') }}
          </v-btn>
          <v-btn
            v-if="onboarding && !added"
            variant="text"
            block
            class="mt-2"
            style="color: #999;"
            @click="skipOnboarding"
          >
            {{ t('member.security.add.skip') }}
          </v-btn>
        </form>
        <v-alert v-if="addError" type="warning" variant="outlined" class="mt-3 text-left">
          {{ addError }}
          <div v-if="needsReauth" class="d-flex ga-2 flex-wrap mt-3">
            <!-- Only with a passkey on the account to confirm with; otherwise the email link is the way. -->
            <v-btn
              v-if="passkeys.length"
              :loading="steppingUp"
              prepend-icon="mdi-fingerprint"
              style="background-color: white; color: #111;"
              @click="confirmWithPasskey"
            >
              {{ t('member.security.add.confirmWithPasskey') }}
            </v-btn>
            <v-btn size="small" variant="outlined" color="white" class="align-self-center" @click="logout">
              {{ t('member.security.add.signOutAndIn') }}
            </v-btn>
          </div>
        </v-alert>
        <v-alert v-if="reauthDone" type="info" variant="outlined" class="mt-3 text-left">
          {{ t('member.security.add.reauthDone', { button: onboarding ? t('member.security.add.submitOnboarding') : t('member.security.add.submit') }) }}
        </v-alert>
        <v-alert v-if="added" type="success" variant="outlined" class="mt-3 text-left">
          {{ t('member.security.add.added', { button: t('auth.login.passkeyButton') }) }}
        </v-alert>
        <v-btn v-if="onboarding && added" to="/member" variant="outlined" color="white" block class="mt-3">
          {{ t('member.security.add.goToOverview') }}
        </v-btn>
      </v-card>
    </section>

    <section class="mb-8">
      <h2 class="section-title">
        {{ t('member.security.list.heading') }}<span
          v-if="!loadingList && passkeys.length"
          style="font-weight: normal; color: #999; font-size: 14px;"
        >
          · {{ passkeys.length }}
        </span>
      </h2>

      <div v-if="loadingList" class="text-center py-3">
        <v-progress-circular indeterminate size="24" color="white" />
      </div>

      <v-alert v-else-if="listError" type="warning" variant="outlined" class="text-left">
        {{ listError }}
      </v-alert>

      <p v-else-if="!passkeys.length" style="color: #888; font-size: 14px;">
        {{ t('member.security.list.empty') }}
      </p>

      <template v-else>
      <v-card
        v-for="passkey in passkeys"
        :key="passkey.id"
        variant="outlined"
        class="pa-4 mb-3"
      >
        <form v-if="editingId === passkey.id" @submit.prevent="saveName(passkey.id)">
          <v-text-field
            v-model="editName"
            :label="t('member.security.list.nameLabel')"
            variant="outlined"
            density="comfortable"
            maxlength="60"
            hide-details="auto"
            autofocus
            class="mb-3"
          />
          <div class="d-flex" style="gap: 8px;">
            <v-btn type="submit" size="small" :loading="busyId === passkey.id" style="background-color: white; color: #111;">
              {{ t('common.save') }}
            </v-btn>
            <v-btn size="small" variant="text" style="color: #999;" @click="editingId = ''">{{ t('common.cancel') }}</v-btn>
          </div>
        </form>

        <template v-else>
          <div class="d-flex align-center flex-wrap" style="gap: 8px;">
            <v-icon size="20" color="white">mdi-fingerprint</v-icon>
            <p class="font-weight-bold mb-0">{{ passkey.name || t('member.security.list.unnamed') }}</p>
            <v-chip v-if="passkey.backedUp" size="x-small" variant="outlined" style="color: #aaa;">
              {{ t('member.security.list.synced') }}
            </v-chip>
          </div>
          <p class="mb-0 mt-1" style="color: #888; font-size: 13px;">
            {{ t('member.security.list.addedOn', { date: formatDate(passkey.createdAt) }) }} ·
            {{
              passkey.lastUsedAt
                ? t('member.security.list.lastUsed', { date: formatDate(passkey.lastUsedAt) })
                : t('member.security.list.neverUsed')
            }}
          </p>
          <div class="d-flex mt-2" style="gap: 4px;">
            <v-btn variant="text" size="small" class="pl-0" style="color: #ccc;" @click="startRename(passkey)">
              {{ t('member.security.list.rename') }}
            </v-btn>
            <v-btn
              variant="text"
              size="small"
              color="red"
              :loading="busyId === passkey.id"
              @click="remove(passkey)"
            >
              {{ t('member.security.list.remove') }}
            </v-btn>
          </div>
        </template>
      </v-card>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'

definePageMeta({ layout: 'member' })

interface Passkey {
  id: string
  name: string | null
  createdAt: string
  lastUsedAt: string | null
  deviceType: string | null
  backedUp: boolean | null
}

const route = useRoute()
const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked, logout, loginWithPasskey } = useAuthSession()
// Arrived here straight after a magic-link sign-in (see the member layout).
const onboarding = computed(() => route.query.onboarding === '1')
// Shared with the layout: adding a passkey hides the "add a passkey" nudge.
const passkeyNudge = useState<boolean>('ctr-passkey-nudge', () => false)

const supported = ref<boolean | null>(null)
const passkeys = ref<Passkey[]>([])
const loadingList = ref(true)
const listError = ref('')

const newName = ref('')
const adding = ref(false)
const addError = ref('')
const needsReauth = ref(false)
const steppingUp = ref(false)
const reauthDone = ref(false)
const added = ref(false)

const editingId = ref('')
const editName = ref('')
const busyId = ref('')

async function loadPasskeys() {
  listError.value = ''
  try {
    passkeys.value = await $fetch<Passkey[]>('/api/auth/passkey/credentials')
  } catch {
    listError.value = t('member.security.errors.loadList')
  } finally {
    loadingList.value = false
  }
}

/** A first guess at a name, so the list is readable even if the member skips it. */
function guessDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return ''
}

async function addPasskey() {
  adding.value = true
  addError.value = ''
  needsReauth.value = false
  reauthDone.value = false
  added.value = false
  try {
    const optionsJSON = await $fetch<any>('/api/auth/passkey/register/options', { method: 'POST' })
    let response: Awaited<ReturnType<typeof startRegistration>>
    try {
      response = await startRegistration({ optionsJSON })
    } catch (err: any) {
      if (err?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
        addError.value = t('member.security.errors.alreadyOnDevice')
      } else if ((err?.cause?.name || err?.name) !== 'NotAllowedError') {
        addError.value = t('member.security.errors.createFailed')
      }
      return
    }
    await $fetch('/api/auth/passkey/register/verify', {
      method: 'POST',
      body: { response, name: newName.value },
    })
    added.value = true
    passkeyNudge.value = false
    newName.value = guessDeviceName()
    await loadPasskeys()
  } catch (err: any) {
    const code = err?.data?.code
    if (code === 'reauth') {
      // The server only adds a passkey within 10 minutes of a sign-in.
      needsReauth.value = true
      addError.value = t('member.security.errors.reauth')
    } else if (code === 'limit') {
      addError.value = t('member.security.errors.limit', { max: err.data.max })
    } else if (err?.statusCode === 409) {
      addError.value = t('member.security.errors.duplicate')
    } else {
      addError.value = t('member.security.errors.saveFailed')
    }
  } finally {
    adding.value = false
  }
}

/**
 * The reauth answer, without signing out: a full passkey sign-in in place gives
 * a fresh session. Adding the new passkey is left to the member's next press,
 * since browsers want a fresh tap for each passkey dialog.
 */
async function confirmWithPasskey() {
  steppingUp.value = true
  try {
    if (!(await loginWithPasskey())) return
    needsReauth.value = false
    addError.value = ''
    reauthDone.value = true
  } catch {
    addError.value = t('member.security.errors.reauthFailed')
  } finally {
    steppingUp.value = false
  }
}

/** "Ikke nå": no onboarding step and no nudge on this browser again. */
async function skipOnboarding() {
  localStorage.setItem('ctr-passkey-nudge-dismissed', '1')
  passkeyNudge.value = false
  await navigateTo('/member')
}

function startRename(passkey: Passkey) {
  editingId.value = passkey.id
  editName.value = passkey.name ?? ''
}

async function saveName(id: string) {
  busyId.value = id
  try {
    await $fetch(`/api/auth/passkey/credentials/${id}`, { method: 'PATCH', body: { name: editName.value } })
    editingId.value = ''
    await loadPasskeys()
  } catch {
    listError.value = t('member.security.errors.rename')
  } finally {
    busyId.value = ''
  }
}

async function remove(passkey: Passkey) {
  const label = passkey.name || t('member.security.list.thisPasskey')
  if (!window.confirm(t('member.security.list.confirmRemove', { label }))) return
  busyId.value = passkey.id
  try {
    await $fetch(`/api/auth/passkey/credentials/${passkey.id}`, { method: 'DELETE' })
    await loadPasskeys()
  } catch {
    listError.value = t('member.security.errors.remove')
  } finally {
    busyId.value = ''
  }
}

onMounted(() => {
  supported.value = browserSupportsWebAuthn()
  newName.value = guessDeviceName()
})

watchEffect(() => {
  if (checked.value && session.value.authenticated) loadPasskeys()
})
</script>

<style scoped>
.member-security {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 12px;
}
</style>
