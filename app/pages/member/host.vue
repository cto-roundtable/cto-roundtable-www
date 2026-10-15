<template>
  <div class="member-host text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.host.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        {{ t('member.host.intro') }}
      </p>
    </header>

    <!-- Volunteer form / existing offer -->
    <section class="mb-10">
      <h2 class="section-title">{{ t('member.host.yourInterest') }}</h2>

      <div v-if="loadingVolunteer" class="text-center py-3">
        <v-progress-circular indeterminate size="24" color="white" />
      </div>

      <v-card v-else-if="volunteer" variant="outlined" class="pa-4">
        <div class="d-flex align-center mb-3" style="gap: 10px;">
          <v-icon color="green" size="20">mdi-check-circle</v-icon>
          <p class="font-weight-bold mb-0">{{ t('member.host.onList') }}</p>
        </div>
        <div style="font-size: 14px; color: #ccc; line-height: 1.7;">
          <p v-if="volunteer.location" class="mb-1">
            <strong>{{ t('member.host.summary.location') }}:</strong> {{ volunteer.location }}
          </p>
          <p v-if="volunteer.participantLimit" class="mb-1">
            <strong>{{ t('member.host.summary.capacity') }}:</strong> {{ t('member.host.summary.capacityValue', volunteer.participantLimit) }}
          </p>
          <p v-if="volunteer.preferredTimeframe" class="mb-1">
            <strong>{{ t('member.host.summary.timeframe') }}:</strong> {{ volunteer.preferredTimeframe }}
          </p>
          <p v-if="volunteer.sponsorFood || volunteer.sponsorDrinks" class="mb-1">
            <strong>{{ t('member.host.summary.sponsors') }}:</strong> {{ sponsorList }}
          </p>
          <p v-if="volunteer.notes" class="mb-1">
            <strong>{{ t('member.host.summary.notes') }}:</strong> {{ volunteer.notes }}
          </p>
          <p class="mb-0" style="color: #888;">
            {{ t('member.host.summary.registered', { date: formatDate(volunteer.createdAt) }) }}
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
          {{ t('member.host.withdraw') }}
        </v-btn>
      </v-card>

      <v-card v-else variant="outlined" class="pa-4">
        <p class="mb-4" style="color: #ccc; font-size: 14px; line-height: 1.6;">
          {{ t('member.host.formIntro') }}
        </p>
        <form @submit.prevent="submitVolunteer">
          <v-text-field
            v-model="form.location"
            :label="t('member.host.form.location')"
            :placeholder="t('member.host.form.locationPlaceholder')"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model.number="form.participantLimit"
            :label="t('member.host.form.capacity')"
            type="number"
            min="1"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="form.preferredTimeframe"
            :label="t('member.host.form.timeframe')"
            :placeholder="t('member.host.form.timeframePlaceholder')"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <div class="d-flex flex-wrap mb-2" style="gap: 16px;">
            <v-checkbox
              v-model="form.sponsorFood"
              :label="t('member.host.form.sponsorFood')"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="form.sponsorDrinks"
              :label="t('member.host.form.sponsorDrinks')"
              density="compact"
              hide-details
            />
          </div>
          <v-textarea
            v-model="form.notes"
            :label="t('member.host.form.notes')"
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
            {{ t('member.host.form.submit') }}
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
        {{ t('member.host.history.heading') }}<span
          v-if="!loadingHistory && history.length"
          style="font-weight: normal; color: #999; font-size: 14px;"
        >
          · {{ t('member.host.history.count', history.length) }}
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
        {{ t('member.host.history.empty') }}
      </div>
      <v-table v-else density="comfortable" class="history-table">
        <thead>
          <tr>
            <th>{{ t('member.host.history.date') }}</th>
            <th>{{ t('member.host.history.theme') }}</th>
            <th>{{ t('member.host.history.group') }}</th>
            <th class="d-none d-sm-table-cell">{{ t('member.host.history.coHosts') }}</th>
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

const { t } = useI18n()
const { tag, formatDate } = useLocaleDate()

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

// "mat og drikke" / "food and drinks": joined by the active language's list rules.
const sponsorList = computed(() => {
  const v = volunteer.value
  if (!v) return ''
  const items: string[] = []
  if (v.sponsorFood) items.push(t('member.host.summary.food'))
  if (v.sponsorDrinks) items.push(t('member.host.summary.drinks'))
  return new Intl.ListFormat(tag.value, { type: 'conjunction' }).format(items)
})

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
    submitError.value = err?.statusMessage || err?.data?.message || t('member.host.form.error')
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
