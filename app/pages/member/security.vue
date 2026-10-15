<template>
  <div class="member-security text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-1" style="font-size: 1.6rem;">Innlogging</h1>
      <!-- Names the account, so a member who was signed in to someone else's
           account (e.g. by a planted link) sees it before binding a passkey. -->
      <p v-if="session.authenticated" class="mb-3" style="color: #fff; font-size: 14px;">
        for <strong>{{ session.name }}</strong><span v-if="session.email"> ({{ session.email }})</span>
      </p>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        Du logger inn med en lenke på e-post. Med en passkey kan du i stedet logge inn med Face ID,
        fingeravtrykk eller en sikkerhetsnøkkel, uten å vente på e-posten. E-postlenken fungerer
        fortsatt, så mister du enheten, logger du bare inn med lenken og fjerner passkeyen her.
      </p>
    </header>

    <section class="mb-10">
      <h2 class="section-title">{{ onboarding ? `Ett steg til: sett opp en passkey for ${session.name}` : 'Legg til en passkey' }}</h2>

      <v-alert v-if="supported === false" type="info" variant="outlined" class="text-left">
        Denne nettleseren støtter ikke passkeys. Du kan fortsatt logge inn med e-postlenken.
      </v-alert>

      <v-card v-else variant="outlined" class="pa-4">
        <p class="mb-4" style="color: #ccc; font-size: 14px; line-height: 1.6;">
          Passkeyen lagres på denne enheten (eller i iCloud-nøkkelringen / Google Password Manager,
          så den følger med til de andre enhetene dine). Vi lagrer bare den offentlige nøkkelen.
        </p>
        <form @submit.prevent="addPasskey">
          <v-text-field
            v-model="newName"
            label="Navn (valgfritt)"
            placeholder="f.eks. MacBook, iPhone"
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
            {{ onboarding ? 'Sett opp passkey' : 'Legg til passkey' }}
          </v-btn>
          <v-btn
            v-if="onboarding && !added"
            variant="text"
            block
            class="mt-2"
            style="color: #999;"
            @click="skipOnboarding"
          >
            Ikke nå
          </v-btn>
        </form>
        <v-alert v-if="addError" type="warning" variant="outlined" class="mt-3 text-left">
          {{ addError }}
          <div v-if="needsReauth" class="mt-2">
            <v-btn size="small" variant="outlined" color="white" @click="logout">Logg ut og logg inn på nytt</v-btn>
          </div>
        </v-alert>
        <v-alert v-if="added" type="success" variant="outlined" class="mt-3 text-left">
          Passkeyen er lagt til. Neste gang kan du velge «Sign in with passkey» på innloggingssiden.
        </v-alert>
        <v-btn v-if="onboarding && added" to="/member" variant="outlined" color="white" block class="mt-3">
          Gå til oversikten
        </v-btn>
      </v-card>
    </section>

    <section class="mb-8">
      <h2 class="section-title">
        Dine passkeys<span
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
        Ingen passkeys ennå. Du logger inn med e-postlenken.
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
            label="Navn"
            variant="outlined"
            density="comfortable"
            maxlength="60"
            hide-details="auto"
            autofocus
            class="mb-3"
          />
          <div class="d-flex" style="gap: 8px;">
            <v-btn type="submit" size="small" :loading="busyId === passkey.id" style="background-color: white; color: #111;">
              Lagre
            </v-btn>
            <v-btn size="small" variant="text" style="color: #999;" @click="editingId = ''">Avbryt</v-btn>
          </div>
        </form>

        <template v-else>
          <div class="d-flex align-center flex-wrap" style="gap: 8px;">
            <v-icon size="20" color="white">mdi-fingerprint</v-icon>
            <p class="font-weight-bold mb-0">{{ passkey.name || 'Passkey uten navn' }}</p>
            <v-chip v-if="passkey.backedUp" size="x-small" variant="outlined" style="color: #aaa;">
              Synkronisert
            </v-chip>
          </div>
          <p class="mb-0 mt-1" style="color: #888; font-size: 13px;">
            Lagt til {{ formatDate(passkey.createdAt) }} ·
            {{ passkey.lastUsedAt ? `sist brukt ${formatDate(passkey.lastUsedAt)}` : 'ikke brukt ennå' }}
          </p>
          <div class="d-flex mt-2" style="gap: 4px;">
            <v-btn variant="text" size="small" class="pl-0" style="color: #ccc;" @click="startRename(passkey)">
              Gi nytt navn
            </v-btn>
            <v-btn
              variant="text"
              size="small"
              color="red"
              :loading="busyId === passkey.id"
              @click="remove(passkey)"
            >
              Fjern
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
const { session, checked, logout } = useAuthSession()
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
const added = ref(false)

const editingId = ref('')
const editName = ref('')
const busyId = ref('')

async function loadPasskeys() {
  listError.value = ''
  try {
    passkeys.value = await $fetch<Passkey[]>('/api/auth/passkey/credentials')
  } catch {
    listError.value = 'Kunne ikke hente passkeys. Prøv igjen.'
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
  added.value = false
  try {
    const optionsJSON = await $fetch<any>('/api/auth/passkey/register/options', { method: 'POST' })
    let response: Awaited<ReturnType<typeof startRegistration>>
    try {
      response = await startRegistration({ optionsJSON })
    } catch (err: any) {
      if (err?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
        addError.value = 'Denne enheten har allerede en passkey for deg.'
      } else if ((err?.cause?.name || err?.name) !== 'NotAllowedError') {
        addError.value = 'Kunne ikke lage en passkey på denne enheten.'
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
      addError.value =
        'Av sikkerhetshensyn kan du bare legge til en passkey rett etter at du har logget inn. ' +
        'Logg ut, logg inn igjen med e-postlenken (eller en passkey du allerede har), og prøv på nytt.'
    } else if (code === 'limit') {
      addError.value = `Du har allerede ${err.data.max} passkeys. Fjern en du ikke bruker, så kan du legge til en ny.`
    } else if (err?.statusCode === 409) {
      addError.value = 'Denne passkeyen er allerede lagt til.'
    } else {
      addError.value =
        'Kunne ikke lagre passkeyen. Prøv igjen, og sjekk at enheten ber om Face ID, fingeravtrykk eller PIN.'
    }
  } finally {
    adding.value = false
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
    listError.value = 'Kunne ikke endre navnet. Prøv igjen.'
  } finally {
    busyId.value = ''
  }
}

async function remove(passkey: Passkey) {
  const label = passkey.name || 'denne passkeyen'
  if (!window.confirm(`Fjerne ${label}? Du kan fortsatt logge inn med e-postlenken.`)) return
  busyId.value = passkey.id
  try {
    await $fetch(`/api/auth/passkey/credentials/${passkey.id}`, { method: 'DELETE' })
    await loadPasskeys()
  } catch {
    listError.value = 'Kunne ikke fjerne passkeyen. Prøv igjen.'
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
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
