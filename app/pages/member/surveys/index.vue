<template>
  <div class="member-surveys text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Undersøkelser</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        Korte undersøkelser etter arrangementene våre. Det tar et par minutter, og det er sånn vi finner ut hva
        som funket og hva vi bør gjøre annerledes neste gang. Styret ser svarene.
      </p>
    </header>

    <!-- Board: create a survey from a recent event. The API is gated on its own. -->
    <section v-if="isBoard" class="mb-10">
      <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
        <h2 class="section-title mb-0">Ny undersøkelse</h2>
        <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
          Styret
        </v-chip>
      </div>

      <v-btn
        v-if="!creating"
        variant="outlined"
        prepend-icon="mdi-plus"
        @click="openCreate"
      >
        Ny undersøkelse
      </v-btn>

      <v-card v-else variant="outlined" class="pa-4">
        <div v-if="loadingEvents" class="text-center py-3">
          <v-progress-circular indeterminate size="24" color="white" />
        </div>
        <template v-else>
          <v-select
            v-model="form.eventId"
            :items="eventItems"
            item-title="label"
            item-value="id"
            item-props="props"
            label="Arrangement"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <p v-if="selectedEvent?.lang === 'en'" class="mb-3" style="color: #aaa; font-size: 13px;">
            Arrangementet hører til {{ selectedEvent.group }}, så undersøkelsen blir på engelsk.
          </p>
          <v-text-field
            v-model="form.title"
            label="Tittel"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-textarea
            v-model="form.intro"
            label="Ingress (valgfritt)"
            rows="2"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="form.closesAt"
            label="Frist (valgfritt)"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />

          <div v-if="template.length" class="mb-4">
            <p class="mb-1" style="color: #ccc; font-size: 14px;">Standardspørsmål:</p>
            <ol class="template-list">
              <li v-for="q in template" :key="q.id">
                {{ q.label }} <span style="color: #888;">({{ typeLabel(q) }})</span>
              </li>
            </ol>
            <p class="mt-1 mb-0" style="color: #888; font-size: 13px;">
              Vil du endre spørsmålene, lag et utkast. Da kan du redigere før noen ser den.
            </p>
          </div>

          <div class="d-flex flex-wrap" style="gap: 12px;">
            <v-btn
              :loading="saving === 'open'"
              :disabled="!form.eventId || Boolean(saving)"
              style="background-color: white; color: #111;"
              @click="create('open')"
            >
              Åpne med standardspørsmål
            </v-btn>
            <v-btn
              variant="outlined"
              :loading="saving === 'draft'"
              :disabled="!form.eventId || Boolean(saving)"
              @click="create('draft')"
            >
              Lag utkast og rediger
            </v-btn>
            <v-btn variant="text" :disabled="Boolean(saving)" @click="creating = false">Avbryt</v-btn>
          </div>
          <v-alert v-if="createError" type="warning" variant="outlined" class="mt-3 text-left">
            {{ createError }}
          </v-alert>
        </template>
      </v-card>
    </section>

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="white" />
    </div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>

    <template v-else>
      <section class="mb-8">
        <h2 class="section-title">Åpne</h2>
        <div v-if="openSurveys.length === 0" class="text-muted" style="font-size: 15px;">
          Ingen åpne undersøkelser akkurat nå.
        </div>
        <div v-else class="feed">
          <NuxtLink v-for="s in openSurveys" :key="s.id" :to="`/member/surveys/${s.id}`" class="survey-link">
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="survey-title">{{ s.title }}</span>
                <span v-if="s.answered" class="tag tag-done">{{ s.lang === 'en' ? 'Answered' : 'Besvart' }}</span>
                <span v-else-if="s.eligible" class="tag tag-todo">{{ s.lang === 'en' ? 'Not answered' : 'Ikke besvart' }}</span>
                <span v-if="s.lang === 'en'" class="tag tag-lang">Sverige</span>
              </div>
              <p class="meta mb-0">
                {{ eventLine(s) }}<span v-if="s.closesAt"> · frist {{ formatDate(s.closesAt) }}</span>
                <span v-if="s.responseCount !== null"> · {{ s.responseCount }} svar</span>
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="isBoard && drafts.length" class="mb-8">
        <h2 class="section-title">Utkast</h2>
        <div class="feed">
          <NuxtLink v-for="s in drafts" :key="s.id" :to="`/member/surveys/${s.id}`" class="survey-link">
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="survey-title">{{ s.title }}</span>
                <span class="tag tag-draft">Utkast</span>
              </div>
              <p class="meta mb-0">{{ eventLine(s) }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="closedSurveys.length" class="mb-8">
        <h2 class="section-title">Avsluttet</h2>
        <div class="feed">
          <NuxtLink
            v-for="s in closedSurveys"
            :key="s.id"
            :to="`/member/surveys/${s.id}/results`"
            class="survey-link"
          >
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="survey-title">{{ s.title }}</span>
                <span v-if="s.answered" class="tag tag-done">{{ s.lang === 'en' ? 'Answered' : 'Besvart' }}</span>
              </div>
              <p class="meta mb-0">
                {{ eventLine(s) }}<span v-if="s.responseCount !== null"> · {{ s.responseCount }} svar</span>
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface SurveySummary {
  id: string
  title: string
  status: 'draft' | 'open' | 'closed'
  isOpen: boolean
  closesAt: string | null
  lang: 'nb' | 'en'
  event: { id: string; date: string | null; theme: string | null; location: string | null }
  eligible: boolean
  answered: boolean
  answeredAt: string | null
  responseCount: number | null
}

interface Question {
  id: string
  type: 'rating' | 'text' | 'choice' | 'multi'
  label: string
  required: boolean
  options?: string[]
  scale?: number
}

interface PickerEvent {
  id: string
  date: string
  theme: string | null
  location: string | null
  group: string | null
  lang: 'nb' | 'en'
  defaultTitle: string
  surveyId: string | null
}

const { session, checked } = useAuthSession()

const surveys = ref<SurveySummary[]>([])
const isBoard = ref(false)
const loading = ref(true)
const loadError = ref('')

const creating = ref(false)
const loadingEvents = ref(false)
const events = ref<PickerEvent[]>([])
const templates = ref<{ nb: Question[]; en: Question[] }>({ nb: [], en: [] })
const form = ref({ eventId: null as string | null, title: '', intro: '', closesAt: '' })
const saving = ref<'' | 'open' | 'draft'>('')
const createError = ref('')

const openSurveys = computed(() => surveys.value.filter((s) => s.status === 'open' && s.isOpen))
const drafts = computed(() => surveys.value.filter((s) => s.status === 'draft'))
const closedSurveys = computed(() => surveys.value.filter((s) => s.status !== 'draft' && !s.isOpen))

const selectedEvent = computed(() => events.value.find((e) => e.id === form.value.eventId) ?? null)
const template = computed(() => (selectedEvent.value ? templates.value[selectedEvent.value.lang] : []))
const eventItems = computed(() =>
  events.value.map((e) => ({
    id: e.id,
    label: `${formatDate(e.date)} · ${e.theme || 'Uten tema'}${e.surveyId ? ' (har undersøkelse)' : ''}`,
    props: { disabled: Boolean(e.surveyId) },
  })),
)

// A new event pick fills in that event's default title, unless the board has
// already typed one of their own.
watch(
  () => form.value.eventId,
  (id, prev) => {
    const ev = events.value.find((e) => e.id === id)
    const prevEv = events.value.find((e) => e.id === prev)
    if (ev && (!form.value.title || form.value.title === prevEv?.defaultTitle)) form.value.title = ev.defaultTitle
  },
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch<{ isBoard: boolean; surveys: SurveySummary[] }>('/api/member/surveys')
    surveys.value = data.surveys
    isBoard.value = data.isBoard
  } catch {
    loadError.value = 'Kunne ikke hente undersøkelsene. Prøv igjen.'
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  creating.value = true
  createError.value = ''
  form.value = { eventId: null, title: '', intro: '', closesAt: '' }
  loadingEvents.value = true
  try {
    const data = await $fetch<{ events: PickerEvent[]; templates: { nb: Question[]; en: Question[] } }>(
      '/api/member/surveys/events',
    )
    events.value = data.events
    templates.value = data.templates
    const first = data.events.find((e) => !e.surveyId)
    if (first) form.value.eventId = first.id
  } catch {
    createError.value = 'Kunne ikke hente arrangementene.'
  } finally {
    loadingEvents.value = false
  }
}

async function create(status: 'open' | 'draft') {
  saving.value = status
  createError.value = ''
  try {
    const res = await $fetch<{ id: string }>('/api/member/surveys', {
      method: 'POST',
      body: {
        eventId: form.value.eventId,
        title: form.value.title,
        intro: form.value.intro,
        // A date picked as the deadline means "through that day", Oslo time.
        closesAt: form.value.closesAt ? new Date(`${form.value.closesAt}T23:59:59`).toISOString() : null,
        status,
      },
    })
    await navigateTo(`/member/surveys/${res.id}`)
  } catch (err: any) {
    createError.value = err?.data?.message || 'Kunne ikke opprette undersøkelsen. Prøv igjen.'
  } finally {
    saving.value = ''
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})

function typeLabel(q: Question): string {
  if (q.type === 'rating') return `skala 1 til ${q.scale ?? 5}`
  if (q.type === 'choice') return (q.options ?? []).join(' / ')
  if (q.type === 'multi') return 'flere valg'
  return 'fritekst'
}

function eventLine(s: SurveySummary): string {
  return [s.event.theme, s.event.date ? formatDate(s.event.date) : null].filter(Boolean).join(', ')
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('nb-NO', { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<style scoped>
.member-surveys {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.text-muted {
  opacity: 0.7;
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.survey-link {
  display: block;
  text-decoration: none;
}

.feed-card {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #fff;
  padding: 18px;
  transition: border-color 0.15s ease;
}

.feed-card:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.survey-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
}

.meta {
  color: #888;
  font-size: 13px;
}

.template-list {
  color: #ccc;
  font-size: 14px;
  padding-left: 1.25rem;
}

.tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 3px;
  color: #fff;
}

.tag-done {
  background: #388e3c;
}

.tag-todo {
  background: #f57c00;
}

.tag-draft {
  background: #616161;
}

.tag-lang {
  background: #1565c0;
}
</style>
