<template>
  <div class="member-host text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Verting</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        Meld deg som interessert i å være vert. Det er ikke en forpliktelse — styret tar kontakt
        når vi planlegger neste samling og matcher deg mot et passende tema og gruppe. Faktiske
        samlinger booker vi via Luma.
      </p>
    </header>

    <!-- Volunteer form / existing offer -->
    <section class="mb-10">
      <h2 class="section-title">Din interesse</h2>

      <div v-if="loadingVolunteer" class="text-center py-3">
        <v-progress-circular indeterminate size="24" color="white" />
      </div>

      <v-card v-else-if="volunteer" variant="outlined" class="pa-4">
        <div class="d-flex align-center mb-3" style="gap: 10px;">
          <v-icon color="green" size="20">mdi-check-circle</v-icon>
          <p class="font-weight-bold mb-0">Du står på listen</p>
        </div>
        <div style="font-size: 14px; color: #ccc; line-height: 1.7;">
          <p v-if="volunteer.location" class="mb-1">
            <strong>Lokasjon:</strong> {{ volunteer.location }}
          </p>
          <p v-if="volunteer.participantLimit" class="mb-1">
            <strong>Kapasitet:</strong> {{ volunteer.participantLimit }} personer
          </p>
          <p v-if="volunteer.preferredTimeframe" class="mb-1">
            <strong>Tidsrom:</strong> {{ volunteer.preferredTimeframe }}
          </p>
          <p v-if="volunteer.sponsorFood || volunteer.sponsorDrinks" class="mb-1">
            <strong>Sponser:</strong>
            <span v-if="volunteer.sponsorFood"> mat</span><span
              v-if="volunteer.sponsorFood && volunteer.sponsorDrinks">,</span><span
              v-if="volunteer.sponsorDrinks"> drikke</span>
          </p>
          <p v-if="volunteer.notes" class="mb-1">
            <strong>Notater:</strong> {{ volunteer.notes }}
          </p>
          <p class="mb-0" style="color: #888;">
            Registrert {{ formatDate(volunteer.createdAt) }}
          </p>
        </div>
        <v-btn
          variant="text"
          size="small"
          color="red"
          class="mt-3 pl-0"
          :loading="withdrawing"
          @click="withdrawOffer"
        >
          Trekk interessen
        </v-btn>
      </v-card>

      <v-card v-else variant="outlined" class="pa-4">
        <p class="mb-4" style="color: #ccc; font-size: 14px; line-height: 1.6;">
          Alle felt er valgfrie — bare å melde seg er nok signal. Styret setter opp samlingen i
          Luma når det er din tur.
        </p>
        <form @submit.prevent="submitVolunteer">
          <v-text-field
            v-model="form.location"
            label="Lokasjon"
            placeholder="f.eks. City center, Torggata, Asker"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model.number="form.participantLimit"
            label="Hvor mange kan dere ta i mot?"
            type="number"
            min="1"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="form.preferredTimeframe"
            label="Tidsrom (valgfritt)"
            placeholder="f.eks. Q3 2026, før sommeren, fleksibel"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <div class="d-flex flex-wrap mb-2" style="gap: 16px;">
            <v-checkbox
              v-model="form.sponsorFood"
              label="Vi sponser mat"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="form.sponsorDrinks"
              label="Vi sponser drikke"
              density="compact"
              hide-details
            />
          </div>
          <v-textarea
            v-model="form.notes"
            label="Notater (valgfritt)"
            rows="3"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-btn
            type="submit"
            :loading="submitting"
            size="large"
            block
            style="background-color: white; color: #111;"
          >
            Meld interesse
          </v-btn>
          <v-alert
            v-if="submitError"
            type="warning"
            variant="outlined"
            class="mt-3 text-left"
          >
            {{ submitError }}
          </v-alert>
        </form>
      </v-card>
    </section>

    <!-- Past hosting history -->
    <section class="mb-8">
      <h2 class="section-title">
        Din verthistorikk<span
          v-if="!loadingHistory && history.length"
          style="font-weight: normal; color: #999; font-size: 14px;"
        >
          · {{ history.length }} {{ history.length === 1 ? 'gang' : 'ganger' }}
        </span>
      </h2>

      <div v-if="loadingHistory" class="text-center py-3">
        <v-progress-circular indeterminate size="24" color="white" />
      </div>
      <div
        v-else-if="history.length === 0"
        class="text-muted"
        style="font-size: 15px;"
      >
        Ingen tidligere verthistorikk enda.
      </div>
      <v-table v-else density="comfortable" class="history-table">
        <thead>
          <tr>
            <th>Dato</th>
            <th>Tema</th>
            <th>Gruppe</th>
            <th class="d-none d-sm-table-cell">Co-hosts</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in history" :key="ev.id">
            <td style="white-space: nowrap;">{{ formatDate(ev.date) }}</td>
            <td>
              <a
                v-if="ev.lumaUrl"
                :href="ev.lumaUrl"
                target="_blank"
                rel="noopener"
                style="color: #fff; text-decoration: underline;"
              >{{ ev.theme || '—' }}</a>
              <span v-else>{{ ev.theme || '—' }}</span>
            </td>
            <td>{{ ev.groupName || '—' }}</td>
            <td class="d-none d-sm-table-cell">{{ ev.coHosts.join(', ') || '—' }}</td>
          </tr>
        </tbody>
      </v-table>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface HostedEvent {
  id: string
  date: string | null
  theme: string | null
  location: string | null
  lumaUrl: string | null
  groupName: string | null
  coHosts: string[]
}

interface VolunteerOffer {
  id: string
  location: string | null
  participantLimit: number | null
  sponsorFood: boolean
  sponsorDrinks: boolean
  preferredTimeframe: string | null
  notes: string | null
  createdAt: string
}

const { session, checked } = useAuthSession()

const history = ref<HostedEvent[]>([])
const volunteer = ref<VolunteerOffer | null>(null)

const loadingHistory = ref(true)
const loadingVolunteer = ref(true)

const form = ref({
  location: '',
  participantLimit: null as number | null,
  sponsorFood: false,
  sponsorDrinks: false,
  preferredTimeframe: '',
  notes: '',
})
const submitting = ref(false)
const submitError = ref('')
const withdrawing = ref(false)

async function loadAll() {
  const [hist, vol] = await Promise.allSettled([
    $fetch<HostedEvent[]>('/api/member/host/history'),
    $fetch<VolunteerOffer | null>('/api/member/host/volunteer'),
  ])
  if (hist.status === 'fulfilled') history.value = hist.value
  loadingHistory.value = false

  if (vol.status === 'fulfilled') volunteer.value = vol.value
  loadingVolunteer.value = false
}

async function submitVolunteer() {
  submitting.value = true
  submitError.value = ''
  try {
    await $fetch('/api/member/host/volunteer', {
      method: 'POST',
      body: form.value,
    })
    volunteer.value = await $fetch<VolunteerOffer | null>('/api/member/host/volunteer')
    form.value = {
      location: '',
      participantLimit: null,
      sponsorFood: false,
      sponsorDrinks: false,
      preferredTimeframe: '',
      notes: '',
    }
  } catch (err: any) {
    submitError.value = err?.statusMessage || err?.data?.message || 'Kunne ikke registrere. Prøv igjen.'
  } finally {
    submitting.value = false
  }
}

async function withdrawOffer() {
  withdrawing.value = true
  try {
    await $fetch('/api/member/host/volunteer', { method: 'DELETE' })
    volunteer.value = null
  } finally {
    withdrawing.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) {
    loadAll()
  }
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
.member-host {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: #fff;
}

.history-table {
  background: transparent !important;
  color: #fff !important;
}

.history-table :deep(th) {
  color: #fff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
}

.history-table :deep(td) {
  color: #fff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
}

.history-table :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.05) !important;
}

.text-muted {
  opacity: 0.7;
}
</style>
