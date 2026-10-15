<template>
  <div class="member-survey text-left">
    <NuxtLink to="/member/surveys" class="back-link mb-4 d-inline-block">← {{ t.back }}</NuxtLink>

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="white" />
    </div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>

    <template v-else-if="survey">
      <header class="mb-6">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ survey.title }}</h1>
        <p class="mb-1" style="color: #aaa; font-size: 14px;">
          {{ eventLine }}<span v-if="survey.closesAt"> · {{ t.deadline }} {{ formatDate(survey.closesAt) }}</span>
        </p>
        <p v-if="survey.intro" class="mt-3 mb-0" style="color: #ccc; font-size: 15px; white-space: pre-line; max-width: 640px;">
          {{ survey.intro }}
        </p>
      </header>

      <!-- Board: status, settings, questions. The API checks requireBoard on its own. -->
      <section v-if="survey.isBoard" class="mb-10">
        <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
          <h2 class="section-title mb-0">Styring</h2>
          <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
            Styret
          </v-chip>
        </div>
        <v-card variant="outlined" class="pa-4">
          <div class="d-flex align-center flex-wrap mb-4" style="gap: 12px;">
            <span class="tag" :class="`tag-${statusKey}`">{{ statusText }}</span>
            <span style="color: #aaa; font-size: 14px;">{{ survey.responseCount }} svar</span>
            <NuxtLink :to="`/member/surveys/${survey.id}/results`" class="inline-link">Se resultater</NuxtLink>
          </div>
          <div class="d-flex flex-wrap mb-4" style="gap: 12px;">
            <v-btn
              v-if="survey.status !== 'open'"
              :loading="statusSaving"
              style="background-color: white; color: #111;"
              @click="setStatus('open')"
            >
              {{ survey.status === 'draft' ? 'Åpne undersøkelsen' : 'Gjenåpne' }}
            </v-btn>
            <v-btn v-if="survey.status === 'open'" variant="outlined" :loading="statusSaving" @click="setStatus('closed')">
              Lukk undersøkelsen
            </v-btn>
          </div>
          <p v-if="survey.status === 'open' && !survey.isOpen" class="mb-4" style="color: #ffb74d; font-size: 13px;">
            Fristen har gått ut, så ingen kan svare lenger. Flytt fristen for å åpne igjen.
          </p>

          <v-text-field
            v-model="settings.title"
            label="Tittel"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-textarea
            v-model="settings.intro"
            label="Ingress (valgfritt)"
            rows="2"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="settings.closesAt"
            label="Frist (valgfritt)"
            type="date"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-btn variant="outlined" :loading="settingsSaving" @click="saveSettings">Lagre</v-btn>
          <v-alert v-if="adminError" type="warning" variant="outlined" class="mt-3 text-left">{{ adminError }}</v-alert>

          <h3 class="sub-title mt-8 mb-2">Spørsmål</h3>
          <p v-if="survey.responseCount" class="mb-0" style="color: #aaa; font-size: 14px;">
            Spørsmålene er låst fordi noen allerede har svart. Da stemmer svarene alltid med spørsmålet de ble gitt til.
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
                <v-btn icon="mdi-arrow-up" size="x-small" variant="text" :disabled="i === 0" @click="move(i, -1)" />
                <v-btn
                  icon="mdi-arrow-down"
                  size="x-small"
                  variant="text"
                  :disabled="i === editQuestions.length - 1"
                  @click="move(i, 1)"
                />
                <v-btn icon="mdi-delete-outline" size="x-small" variant="text" @click="editQuestions.splice(i, 1)" />
              </div>
              <v-text-field
                v-model="q.label"
                label="Spørsmål"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
              />
              <v-textarea
                v-if="q.type === 'choice' || q.type === 'multi'"
                v-model="q.optionsText"
                label="Svaralternativer, ett per linje"
                rows="3"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
              />
              <v-text-field
                v-if="q.type === 'rating'"
                v-model.number="q.scale"
                label="Skala 1 til"
                type="number"
                min="2"
                max="10"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
                style="max-width: 140px;"
              />
              <v-checkbox v-model="q.required" label="Må besvares" density="compact" hide-details />
            </div>
            <div class="d-flex flex-wrap" style="gap: 12px;">
              <v-btn variant="text" prepend-icon="mdi-plus" @click="addQuestion">Legg til spørsmål</v-btn>
              <v-btn variant="outlined" :loading="questionsSaving" @click="saveQuestions">Lagre spørsmål</v-btn>
            </div>
            <v-alert v-if="questionsError" type="warning" variant="outlined" class="mt-3 text-left">
              {{ questionsError }}
            </v-alert>
          </template>
        </v-card>
      </section>

      <!-- The answer form -->
      <section>
        <h2 v-if="survey.isBoard" class="section-title">{{ t.yourAnswer }}</h2>

        <v-alert v-if="!survey.eligible" type="info" variant="outlined" class="text-left mb-4">
          {{ t.notEligible }}
        </v-alert>
        <v-alert v-else-if="!survey.isOpen" type="info" variant="outlined" class="text-left mb-4">
          {{ survey.status === 'draft' ? t.draft : t.closed }}
          <NuxtLink v-if="survey.mySubmittedAt" :to="`/member/surveys/${survey.id}/results`" class="inline-link">
            {{ t.seeResults }}
          </NuxtLink>
        </v-alert>

        <v-alert v-if="justSaved" type="success" variant="outlined" class="text-left mb-4">
          {{ t.thanks }}
          <NuxtLink :to="`/member/surveys/${survey.id}/results`" class="inline-link">{{ t.seeResults }}</NuxtLink>
        </v-alert>
        <p v-else-if="survey.mySubmittedAt && survey.isOpen" class="mb-4" style="color: #aaa; font-size: 14px;">
          {{ t.answeredAt }} {{ formatDate(survey.myUpdatedAt || survey.mySubmittedAt) }}. {{ t.canEdit }}
          <NuxtLink :to="`/member/surveys/${survey.id}/results`" class="inline-link">{{ t.seeResults }}</NuxtLink>
        </p>

        <form v-if="survey.eligible" style="max-width: 640px;" @submit.prevent="submit">
          <fieldset :disabled="!survey.canAnswer" class="answer-fieldset">
            <div v-for="q in survey.questions" :key="q.id" class="question mb-6">
              <p class="question-label mb-2">
                {{ q.label }}<span v-if="q.required" class="required" :title="t.required"> *</span>
              </p>

              <div v-if="q.type === 'rating'">
                <div class="rating-row" role="radiogroup" :aria-label="q.label">
                  <v-btn
                    v-for="n in q.scale ?? 5"
                    :key="n"
                    :variant="answers[q.id] === n ? 'flat' : 'outlined'"
                    :class="{ 'rating-active': answers[q.id] === n }"
                    :disabled="!survey.canAnswer"
                    :aria-pressed="answers[q.id] === n"
                    min-width="44"
                    height="44"
                    @click="answers[q.id] = answers[q.id] === n ? null : n"
                  >
                    {{ n }}
                  </v-btn>
                </div>
                <p class="scale-hint mb-0">{{ t.scaleHint(q.scale ?? 5) }}</p>
              </div>

              <v-textarea
                v-else-if="q.type === 'text'"
                v-model="answers[q.id]"
                rows="3"
                auto-grow
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                :disabled="!survey.canAnswer"
              />

              <v-radio-group
                v-else-if="q.type === 'choice'"
                v-model="answers[q.id]"
                :disabled="!survey.canAnswer"
                hide-details
                density="compact"
              >
                <v-radio v-for="o in q.options" :key="o" :label="o" :value="o" />
              </v-radio-group>

              <div v-else-if="q.type === 'multi'">
                <v-checkbox
                  v-for="o in q.options"
                  :key="o"
                  v-model="answers[q.id]"
                  :label="o"
                  :value="o"
                  :disabled="!survey.canAnswer"
                  hide-details
                  density="compact"
                />
              </div>

              <p v-if="fieldErrors[q.id]" class="field-error mb-0">{{ fieldErrors[q.id] }}</p>
            </div>
          </fieldset>

          <v-btn
            v-if="survey.canAnswer"
            type="submit"
            :loading="submitting"
            size="large"
            block
            style="background-color: white; color: #111;"
          >
            {{ survey.mySubmittedAt ? t.update : t.submit }}
          </v-btn>
          <v-alert v-if="submitError" type="warning" variant="outlined" class="mt-3 text-left">
            {{ submitError }}
          </v-alert>
        </form>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

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
  canAnswer: boolean
  isBoard: boolean
  responseCount: number | null
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

// Member-facing copy. A survey on a roundtable-sweden event is in English.
const COPY = {
  nb: {
    back: 'Alle undersøkelser',
    deadline: 'frist',
    yourAnswer: 'Ditt svar',
    notEligible:
      'Du er ikke med i gruppen dette arrangementet hører til, så du kan ikke svare selv. Som styremedlem ser du likevel resultatene.',
    draft: 'Dette er et utkast. Medlemmene ser det ikke før det er åpnet.',
    closed: 'Undersøkelsen er lukket.',
    thanks: 'Takk! Svaret ditt er lagret.',
    answeredAt: 'Du svarte',
    canEdit: 'Du kan endre svaret så lenge undersøkelsen er åpen.',
    seeResults: 'Se resultatene',
    required: 'Må besvares',
    scaleHint: (n: number) => `1 = lite, ${n} = svært`,
    submit: 'Send svar',
    update: 'Oppdater svaret',
    failed: 'Kunne ikke lagre svaret. Prøv igjen.',
    loadFailed: 'Fant ikke undersøkelsen.',
  },
  en: {
    back: 'All surveys',
    deadline: 'closes',
    yourAnswer: 'Your answer',
    notEligible:
      'You are not in the group this event belongs to, so you cannot answer yourself. As a board member you can still see the results.',
    draft: 'This is a draft. Members cannot see it until it is opened.',
    closed: 'This survey is closed.',
    thanks: 'Thank you! Your answer is saved.',
    answeredAt: 'You answered on',
    canEdit: 'You can change your answer while the survey is open.',
    seeResults: 'See the results',
    required: 'Required',
    scaleHint: (n: number) => `1 = not at all, ${n} = very`,
    submit: 'Send answer',
    update: 'Update answer',
    failed: 'Could not save your answer. Please try again.',
    loadFailed: 'Survey not found.',
  },
}

const route = useRoute()
const { session, checked } = useAuthSession()

const survey = ref<Survey | null>(null)
const loading = ref(true)
const loadError = ref('')
const answers = ref<Record<string, any>>({})
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const submitError = ref('')
const justSaved = ref(false)

const settings = ref({ title: '', intro: '', closesAt: '' })
const settingsSaving = ref(false)
const statusSaving = ref(false)
const adminError = ref('')
const editQuestions = ref<EditQuestion[]>([])
const questionsSaving = ref(false)
const questionsError = ref('')
let nextKey = 1

const t = computed(() => COPY[survey.value?.lang ?? 'nb'])

const typeItems = [
  { title: 'Skala', value: 'rating' },
  { title: 'Fritekst', value: 'text' },
  { title: 'Ett valg', value: 'choice' },
  { title: 'Flere valg', value: 'multi' },
]

const eventLine = computed(() => {
  const e = survey.value?.event
  if (!e) return ''
  const locale = survey.value?.lang === 'en' ? 'en-GB' : 'nb-NO'
  const date = e.date
    ? new Date(e.date).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  return [e.theme, date, e.location].filter(Boolean).join(', ')
})

const statusKey = computed(() => {
  if (!survey.value) return 'draft'
  if (survey.value.status === 'open' && !survey.value.isOpen) return 'closed'
  return survey.value.status
})
const statusText = computed(
  () => ({ draft: 'Utkast', open: 'Åpen', closed: 'Lukket' })[statusKey.value as 'draft' | 'open' | 'closed'],
)

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
  const a: Record<string, any> = {}
  for (const q of s.questions) {
    const mine = s.myAnswers?.[q.id]
    a[q.id] = q.type === 'multi' ? (Array.isArray(mine) ? [...mine] : []) : (mine ?? null)
  }
  answers.value = a
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
    loadError.value = COPY.nb.loadFailed
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!survey.value) return
  submitting.value = true
  submitError.value = ''
  fieldErrors.value = {}
  justSaved.value = false
  try {
    await $fetch(`/api/member/surveys/${survey.value.id}/response`, {
      method: 'POST',
      body: { answers: answers.value },
    })
    await load()
    justSaved.value = true
  } catch (err: any) {
    fieldErrors.value = err?.data?.data?.errors ?? {}
    submitError.value = err?.data?.message || t.value.failed
  } finally {
    submitting.value = false
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
    adminError.value = err?.data?.message || 'Kunne ikke endre status.'
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
    adminError.value = err?.data?.message || 'Kunne ikke lagre.'
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
    questionsError.value = err?.data?.message || 'Kunne ikke lagre spørsmålene.'
  } finally {
    questionsSaving.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const locale = survey.value?.lang === 'en' ? 'en-GB' : 'nb-NO'
  return new Date(dateStr).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
}
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

.answer-fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}

.question-label {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.required {
  color: #ffb74d;
}

.rating-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rating-row .v-btn {
  color: #fff;
}

.rating-row .rating-active {
  background: #fff;
  color: #111;
}

.scale-hint {
  color: #888;
  font-size: 12px;
  margin-top: 4px;
}

.field-error {
  color: #ffb74d;
  font-size: 13px;
  margin-top: 4px;
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
