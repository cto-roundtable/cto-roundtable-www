<template>
  <div class="member-survey text-left">
    <NuxtLink to="/member/surveys" class="back-link mb-4 d-inline-block">← {{ t('member.surveys.answer.back') }}</NuxtLink>

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="white" />
    </div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>

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

      <!-- The board edits and reads results on a page of its own; answering comes first here. -->
      <p v-if="survey.isBoard" class="mb-6" style="font-size: 14px;">
        <NuxtLink :to="`/member/surveys/${survey.id}/manage`" class="inline-link muted-link">{{ t('member.surveys.admin.manageLink') }}</NuxtLink>
      </p>

      <!-- The answer form -->
      <section>
        <h2 v-if="survey.isBoard" class="section-title">{{ t('member.surveys.answer.yourAnswer') }}</h2>

        <v-alert v-if="!survey.eligible" type="info" variant="outlined" class="text-left mb-4">
          {{ ineligibleText }}
        </v-alert>
        <v-alert v-else-if="!survey.isOpen" type="info" variant="outlined" class="text-left mb-4">
          {{ survey.status === 'draft' ? t('member.surveys.answer.draft') : t('member.surveys.answer.closed') }}
          <NuxtLink v-if="survey.mySubmittedAt" :to="`/member/surveys/${survey.id}/results`" class="inline-link">
            {{ t('member.surveys.answer.seeResults') }}
          </NuxtLink>
        </v-alert>

        <v-alert v-if="justSaved" type="success" variant="outlined" class="text-left mb-4">
          {{ t('member.surveys.answer.thanks') }}
          <NuxtLink :to="`/member/surveys/${survey.id}/results`" class="inline-link">{{ t('member.surveys.answer.seeResults') }}</NuxtLink>
        </v-alert>
        <p v-else-if="survey.mySubmittedAt && survey.isOpen" class="mb-4" style="color: #aaa; font-size: 14px;">
          {{ t('member.surveys.answer.answeredAt', { date: formatDate(survey.myUpdatedAt || survey.mySubmittedAt) }) }}
          {{ t('member.surveys.answer.canEdit') }}
          <NuxtLink :to="`/member/surveys/${survey.id}/results`" class="inline-link">{{ t('member.surveys.answer.seeResults') }}</NuxtLink>
        </p>

        <form v-if="survey.eligible" style="max-width: 640px;" @submit.prevent="submit">
          <fieldset :disabled="!survey.canAnswer" class="answer-fieldset">
            <div v-for="q in survey.questions" :key="q.id" class="question mb-6">
              <p class="question-label mb-2">
                {{ q.label }}<span v-if="q.required" class="required" :title="t('member.surveys.answer.required')"> *</span>
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
                <p class="scale-hint mb-0">{{ t('member.surveys.answer.scaleHint', { max: q.scale ?? 5 }) }}</p>
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
            {{ survey.mySubmittedAt ? t('member.surveys.answer.update') : t('member.surveys.answer.submit') }}
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

const route = useRoute()
const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()

const survey = ref<Survey | null>(null)
const loading = ref(true)
const loadError = ref('')
const answers = ref<Record<string, any>>({})
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const submitError = ref('')
const justSaved = ref(false)

const eventLine = computed(() => {
  const e = survey.value?.event
  if (!e) return ''
  const date = e.date ? formatDate(e.date) : null
  return [e.theme, date, e.location].filter(Boolean).join(', ')
})

// Only the board reaches this page without being eligible; anyone else gets a 404.
const ineligibleText = computed(() => {
  switch (survey.value?.ineligibleReason) {
    case 'not_attended':
      return t('member.surveys.answer.notAttended')
    case 'no_luma':
      return t('member.surveys.answer.noLuma')
    default:
      return t('member.surveys.answer.notEligible')
  }
})

function fill(s: Survey) {
  survey.value = s
  const a: Record<string, any> = {}
  for (const q of s.questions) {
    const mine = s.myAnswers?.[q.id]
    a[q.id] = q.type === 'multi' ? (Array.isArray(mine) ? [...mine] : []) : (mine ?? null)
  }
  answers.value = a
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
    submitError.value = err?.data?.message || t('member.surveys.answer.failed')
  } finally {
    submitting.value = false
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

.muted-link {
  color: #aaa;
}
</style>
