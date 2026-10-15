<template>
  <div class="member-surveys text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.surveys.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        {{ t('member.surveys.intro') }}
      </p>
    </header>

    <!-- Board: create a survey from a recent event. The API is gated on its own. -->
    <section v-if="isBoard" class="mb-10">
      <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
        <h2 class="section-title mb-0">{{ t('member.surveys.create.newSurvey') }}</h2>
        <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
          {{ t('common.board') }}
        </v-chip>
      </div>

      <v-btn
        v-if="!creating"
        variant="outlined"
        prepend-icon="mdi-plus"
        @click="openCreate"
      >
        {{ t('member.surveys.create.newSurvey') }}
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
            :label="t('member.surveys.create.event')"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <p v-if="selectedEvent?.lang === 'en'" class="mb-3" style="color: #aaa; font-size: 13px;">
            {{ t('member.surveys.create.englishNote', { group: selectedEvent.group }) }}
          </p>
          <v-text-field
            v-model="form.title"
            :label="t('member.surveys.fields.title')"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-textarea
            v-model="form.intro"
            :label="t('member.surveys.fields.intro')"
            rows="2"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="form.closesAt"
            :label="t('member.surveys.fields.deadline')"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />

          <div v-if="template.length" class="mb-4">
            <p class="mb-1" style="color: #ccc; font-size: 14px;">{{ t('member.surveys.create.defaultQuestions') }}</p>
            <ol class="template-list">
              <li v-for="q in template" :key="q.id">
                {{ q.label }} <span style="color: #888;">({{ typeLabel(q) }})</span>
              </li>
            </ol>
            <p class="mt-1 mb-0" style="color: #888; font-size: 13px;">
              {{ t('member.surveys.create.draftHint') }}
            </p>
          </div>

          <div class="d-flex flex-wrap" style="gap: 12px;">
            <v-btn
              :loading="saving === 'open'"
              :disabled="!form.eventId || Boolean(saving)"
              style="background-color: white; color: #111;"
              @click="create('open')"
            >
              {{ t('member.surveys.create.openWithDefaults') }}
            </v-btn>
            <v-btn
              variant="outlined"
              :loading="saving === 'draft'"
              :disabled="!form.eventId || Boolean(saving)"
              @click="create('draft')"
            >
              {{ t('member.surveys.create.draftAndEdit') }}
            </v-btn>
            <v-btn variant="text" :disabled="Boolean(saving)" @click="creating = false">{{ t('common.cancel') }}</v-btn>
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
        <h2 class="section-title">{{ t('member.surveys.sections.open') }}</h2>
        <div v-if="openSurveys.length === 0" class="text-muted" style="font-size: 15px;">
          {{ t('member.surveys.sections.none') }}
        </div>
        <div v-else class="feed">
          <NuxtLink v-for="s in openSurveys" :key="s.id" :to="`/member/surveys/${s.id}`" class="survey-link">
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="survey-title">{{ s.title }}</span>
                <span v-if="s.answered" class="tag tag-done">{{ t('member.surveys.tags.answered') }}</span>
                <span v-else-if="s.eligible" class="tag tag-todo">{{ t('member.surveys.tags.notAnswered') }}</span>
                <span v-if="s.lang === 'en'" class="tag tag-lang">{{ t('member.surveys.tags.sweden') }}</span>
              </div>
              <p class="meta mb-0">
                {{ eventLine(s) }}<span v-if="s.closesAt"> · {{ t('member.surveys.deadlineOn', { date: formatDate(s.closesAt) }) }}</span>
                <span v-if="s.responseCount !== null"> · {{ t('member.surveys.responses', s.responseCount) }}</span>
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="isBoard && drafts.length" class="mb-8">
        <h2 class="section-title">{{ t('member.surveys.sections.drafts') }}</h2>
        <div class="feed">
          <NuxtLink v-for="s in drafts" :key="s.id" :to="`/member/surveys/${s.id}`" class="survey-link">
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="survey-title">{{ s.title }}</span>
                <span class="tag tag-draft">{{ t('member.surveys.tags.draft') }}</span>
              </div>
              <p class="meta mb-0">{{ eventLine(s) }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="closedSurveys.length" class="mb-8">
        <h2 class="section-title">{{ t('member.surveys.sections.closed') }}</h2>
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
                <span v-if="s.answered" class="tag tag-done">{{ t('member.surveys.tags.answered') }}</span>
              </div>
              <p class="meta mb-0">
                {{ eventLine(s) }}<span v-if="s.responseCount !== null"> · {{ t('member.surveys.responses', s.responseCount) }}</span>
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

const { t } = useI18n()
const { formatDate } = useLocaleDate()
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
// The default questions follow the EVENT's language (English for roundtable-sweden), not the visitor's.
const template = computed(() => (selectedEvent.value ? templates.value[selectedEvent.value.lang] : []))
const eventItems = computed(() =>
  events.value.map((e) => ({
    id: e.id,
    label: t(e.surveyId ? 'member.surveys.create.eventOptionTaken' : 'member.surveys.create.eventOption', {
      date: formatDate(e.date),
      theme: e.theme || t('member.surveys.create.noTheme'),
    }),
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
    loadError.value = t('member.surveys.errors.load')
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
    createError.value = t('member.surveys.errors.events')
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
    createError.value = err?.data?.message || t('member.surveys.errors.create')
  } finally {
    saving.value = ''
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})

function typeLabel(q: Question): string {
  if (q.type === 'rating') return t('member.surveys.typeLabel.rating', { max: q.scale ?? 5 })
  if (q.type === 'choice') return (q.options ?? []).join(' / ')
  if (q.type === 'multi') return t('member.surveys.typeLabel.multi')
  return t('member.surveys.typeLabel.text')
}

function eventLine(s: SurveySummary): string {
  return [s.event.theme, s.event.date ? formatDate(s.event.date) : null].filter(Boolean).join(', ')
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
