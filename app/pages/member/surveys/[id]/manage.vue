<template>
  <div class="member-survey text-left">
    <NuxtLink :to="`/member/surveys/${route.params.id}`" class="back-link mb-4 d-inline-block">← {{ t('member.surveys.admin.backToAnswer') }}</NuxtLink>

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="white" />
    </div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>
    <v-alert v-else-if="survey && !survey.isBoard" type="info" variant="outlined" class="text-left">
      {{ t('member.surveys.admin.boardOnly') }}
    </v-alert>

    <template v-else-if="survey">
      <header class="mb-6">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ survey.title }}</h1>
        <p class="mb-1" style="color: #aaa; font-size: 14px;">
          {{ eventLine }}<span v-if="survey.closesAt"> · {{ t('member.surveys.deadlineOn', { date: formatDate(survey.closesAt) }) }}</span>
        </p>
        <p v-if="survey.intro" class="mt-3 mb-0" style="color: #ccc; font-size: 15px; white-space: pre-line; max-width: 640px;">
          {{ survey.intro }}
        </p>
      </header>

      <!-- Board: status, settings, questions. The API checks requireBoard on its own. -->
      <section class="mb-10">
        <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
          <h2 class="section-title mb-0">{{ t('member.surveys.admin.heading') }}</h2>
          <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
            {{ t('common.board') }}
          </v-chip>
        </div>
        <v-card variant="outlined" class="pa-4">
          <div class="d-flex align-center flex-wrap mb-4" style="gap: 12px;">
            <span class="tag" :class="`tag-${statusKey}`">{{ statusText }}</span>
            <span style="color: #aaa; font-size: 14px;">{{ t('member.surveys.responses', survey.responseCount ?? 0) }}</span>
            <span style="color: #aaa; font-size: 14px;">{{ t('member.surveys.admin.attendees', survey.attendeeCount ?? 0) }}</span>
            <NuxtLink :to="`/member/surveys/${survey.id}/results`" class="inline-link">{{ t('member.surveys.admin.seeResults') }}</NuxtLink>
          </div>
          <div class="d-flex flex-wrap mb-4" style="gap: 12px;">
            <v-btn
              v-if="survey.status !== 'open'"
              :loading="statusSaving"
              style="background-color: white; color: #111;"
              @click="setStatus('open')"
            >
              {{ survey.status === 'draft' ? t('member.surveys.admin.open') : t('member.surveys.admin.reopen') }}
            </v-btn>
            <v-btn v-if="survey.status === 'open'" variant="outlined" :loading="statusSaving" @click="setStatus('closed')">
              {{ t('member.surveys.admin.close') }}
            </v-btn>
          </div>
          <p v-if="!survey.attendeeCount" class="mb-4" style="color: #ffb74d; font-size: 13px;">
            {{ survey.hasLuma ? t('member.surveys.create.noAttendees') : t('member.surveys.create.noLuma') }}
          </p>
          <p v-if="survey.status === 'open' && !survey.isOpen" class="mb-4" style="color: #ffb74d; font-size: 13px;">
            {{ t('member.surveys.admin.expired') }}
          </p>

          <v-text-field
            v-model="settings.title"
            :label="t('member.surveys.fields.title')"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-textarea
            v-model="settings.intro"
            :label="t('member.surveys.fields.intro')"
            rows="2"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="settings.closesAt"
            :label="t('member.surveys.fields.deadline')"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-btn variant="outlined" :loading="settingsSaving" @click="saveSettings">{{ t('common.save') }}</v-btn>
          <v-alert v-if="adminError" type="warning" variant="outlined" class="mt-3 text-left">{{ adminError }}</v-alert>

          <h3 class="sub-title mt-8 mb-2">{{ t('member.surveys.admin.questionsHeading') }}</h3>
          <p v-if="survey.responseCount" class="mb-0" style="color: #aaa; font-size: 14px;">
            {{ t('member.surveys.admin.locked') }}
          </p>
          <template v-else>
            <div v-for="(q, i) in editQuestions" :key="q.key" class="question-editor mb-3">
              <div class="d-flex align-center mb-2" style="gap: 8px;">
                <span style="color: #888; font-size: 13px;">{{ i + 1 }}.</span>
                <v-select
                  v-model="q.type"
                  :items="typeItems"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                  style="max-width: 200px;"
                />
                <v-spacer />
                <v-btn
                  icon="mdi-arrow-up"
                  size="x-small"
                  variant="text"
                  :aria-label="t('member.surveys.admin.moveUp')"
                  :disabled="i === 0"
                  @click="move(i, -1)"
                />
                <v-btn
                  icon="mdi-arrow-down"
                  size="x-small"
                  variant="text"
                  :aria-label="t('member.surveys.admin.moveDown')"
                  :disabled="i === editQuestions.length - 1"
                  @click="move(i, 1)"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  :aria-label="t('member.surveys.admin.deleteQuestion')"
                  @click="editQuestions.splice(i, 1)"
                />
              </div>
              <v-text-field
                v-model="q.label"
                :label="t('member.surveys.admin.question')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
              />
              <v-textarea
                v-if="q.type === 'choice' || q.type === 'multi'"
                v-model="q.optionsText"
                :label="t('member.surveys.admin.options')"
                rows="3"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
              />
              <v-text-field
                v-if="q.type === 'rating'"
                v-model.number="q.scale"
                :label="t('member.surveys.admin.scaleMax')"
                type="number"
                min="2"
                max="10"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
                style="max-width: 140px;"
              />
              <v-checkbox v-model="q.required" :label="t('member.surveys.admin.required')" density="compact" hide-details />
            </div>
            <div class="d-flex flex-wrap" style="gap: 12px;">
              <v-btn variant="text" prepend-icon="mdi-plus" @click="addQuestion">{{ t('member.surveys.admin.addQuestion') }}</v-btn>
              <v-btn variant="outlined" :loading="questionsSaving" @click="saveQuestions">{{ t('member.surveys.admin.saveQuestions') }}</v-btn>
            </div>
            <v-alert v-if="questionsError" type="warning" variant="outlined" class="mt-3 text-left">
              {{ questionsError }}
            </v-alert>
          </template>
        </v-card>
      </section>

    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

// The board's page for one survey: status, settings and questions. Answering lives on
// /member/surveys/[id], so a board member who only wants to answer never lands here.

type QuestionType = 'rating' | 'text' | 'choice' | 'multi'

interface Question {
  id: string
  type: QuestionType
  label: string
  required: boolean
  options?: string[]
  scale?: number
}

interface Survey {
  id: string
  title: string
  intro: string | null
  status: 'draft' | 'open' | 'closed'
  isOpen: boolean
  closesAt: string | null
  lang: 'nb' | 'en'
  event: { id: string; date: string | null; theme: string | null; location: string | null }
  questions: Question[]
  eligible: boolean
  ineligibleReason: 'not_in_group' | 'no_luma' | 'not_attended' | null
  canAnswer: boolean
  isBoard: boolean
  responseCount: number | null
  attendeeCount: number | null
  hasLuma: boolean
  myAnswers: Record<string, number | string | string[]> | null
  mySubmittedAt: string | null
  myUpdatedAt: string | null
}

interface EditQuestion {
  key: number
  id: string
  type: QuestionType
  label: string
  required: boolean
  optionsText: string
  scale: number
}

const route = useRoute()
const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()

const survey = ref<Survey | null>(null)
const loading = ref(true)
const loadError = ref('')

const settings = ref({ title: '', intro: '', closesAt: '' })
const settingsSaving = ref(false)
const statusSaving = ref(false)
const adminError = ref('')
const editQuestions = ref<EditQuestion[]>([])
const questionsSaving = ref(false)
const questionsError = ref('')
let nextKey = 1

const typeItems = computed(() =>
  (['rating', 'text', 'choice', 'multi'] as const).map((value) => ({
    title: t(`member.surveys.admin.types.${value}`),
    value,
  })),
)

const eventLine = computed(() => {
  const e = survey.value?.event
  if (!e) return ''
  const date = e.date ? formatDate(e.date) : null
  return [e.theme, date, e.location].filter(Boolean).join(', ')
})

const statusKey = computed(() => {
  if (!survey.value) return 'draft'
  if (survey.value.status === 'open' && !survey.value.isOpen) return 'closed'
  return survey.value.status
})
const statusText = computed(() => t(`member.surveys.admin.status.${statusKey.value}`))

function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromDateInput(s: string): string | null {
  // A date picked as the deadline means "through that day", local time.
  return s ? new Date(`${s}T23:59:59`).toISOString() : null
}

function fill(s: Survey) {
  survey.value = s
  settings.value = { title: s.title, intro: s.intro ?? '', closesAt: toDateInput(s.closesAt) }
  editQuestions.value = s.questions.map((q) => ({
    key: nextKey++,
    id: q.id,
    type: q.type,
    label: q.label,
    required: q.required,
    optionsText: (q.options ?? []).join('\n'),
    scale: q.scale ?? 5,
  }))
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    fill(await $fetch<Survey>(`/api/member/surveys/${route.params.id}`))
  } catch {
    loadError.value = t('member.surveys.answer.loadFailed')
  } finally {
    loading.value = false
  }
}

async function patch(body: Record<string, unknown>) {
  await $fetch(`/api/member/surveys/${survey.value!.id}`, { method: 'PATCH', body })
  fill(await $fetch<Survey>(`/api/member/surveys/${survey.value!.id}`))
}

async function setStatus(status: 'open' | 'closed') {
  statusSaving.value = true
  adminError.value = ''
  try {
    await patch({ status })
  } catch (err: any) {
    adminError.value = err?.data?.message || t('member.surveys.admin.errors.status')
  } finally {
    statusSaving.value = false
  }
}

async function saveSettings() {
  settingsSaving.value = true
  adminError.value = ''
  try {
    await patch({
      title: settings.value.title,
      intro: settings.value.intro,
      closesAt: fromDateInput(settings.value.closesAt),
    })
  } catch (err: any) {
    adminError.value = err?.data?.message || t('member.surveys.admin.errors.save')
  } finally {
    settingsSaving.value = false
  }
}

function addQuestion() {
  editQuestions.value.push({
    key: nextKey++,
    id: '',
    type: 'text',
    label: '',
    required: false,
    optionsText: '',
    scale: 5,
  })
}

function move(i: number, dir: -1 | 1) {
  const list = editQuestions.value
  const [q] = list.splice(i, 1)
  list.splice(i + dir, 0, q!)
}

async function saveQuestions() {
  questionsSaving.value = true
  questionsError.value = ''
  try {
    // A new question has no id; the server gives it the next free qN.
    await patch({
      questions: editQuestions.value.map((q) => ({
        id: q.id || undefined,
        type: q.type,
        label: q.label,
        required: q.required,
        ...(q.type === 'rating' ? { scale: Number(q.scale) } : {}),
        ...(q.type === 'choice' || q.type === 'multi'
          ? {
              options: q.optionsText
                .split('\n')
                .map((o) => o.trim())
                .filter(Boolean),
            }
          : {}),
      })),
    })
  } catch (err: any) {
    questionsError.value = err?.data?.message || t('member.surveys.admin.errors.questions')
  } finally {
    questionsSaving.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})
</script>

<style scoped>
.member-survey {
  line-height: 1.7;
}

.back-link,
.inline-link {
  color: #fff;
  font-size: 14px;
  text-decoration: underline;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.sub-title {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

.question-editor {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  padding: 12px;
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

.tag-open {
  background: #388e3c;
}

.tag-closed {
  background: #616161;
}

.tag-draft {
  background: #f57c00;
}
</style>
