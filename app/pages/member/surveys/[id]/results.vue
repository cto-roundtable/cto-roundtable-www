<template>
  <div class="member-survey-results text-left">
    <NuxtLink :to="`/member/surveys/${route.params.id}`" class="back-link mb-4 d-inline-block">← {{ t.back }}</NuxtLink>

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="white" />
    </div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>

    <template v-else-if="results">
      <header class="mb-6">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ results.title }}</h1>
        <p class="mb-1" style="color: #aaa; font-size: 14px;">
          {{ t.responses(results.responseCount) }} · {{ results.isOpen ? t.open : t.closed }}
        </p>
        <p class="mt-3 mb-0" style="color: #aaa; font-size: 13px; line-height: 1.6; max-width: 640px;">
          {{ results.full ? t.boardNote : t.memberNote }}
        </p>
      </header>

      <div v-if="results.responseCount === 0" class="text-muted" style="font-size: 15px;">{{ t.none }}</div>

      <div v-else class="d-flex flex-column" style="gap: 16px;">
        <v-card v-for="q in results.questions" :key="q.id" variant="outlined" class="pa-4">
          <p class="question-label mb-1">{{ q.label }}</p>
          <p class="meta mb-3">{{ t.answered(q.answered) }}</p>

          <template v-if="q.type === 'rating'">
            <p class="average mb-2">
              {{ q.average ?? '-' }}<span class="average-of"> / {{ q.scale }}</span>
            </p>
            <div v-for="(count, i) in q.distribution" :key="i" class="bar-row">
              <span class="bar-label">{{ i + 1 }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: pct(count, q.answered) }" /></div>
              <span class="bar-count">{{ count }}</span>
            </div>
          </template>

          <template v-else-if="q.type === 'choice' || q.type === 'multi'">
            <div v-for="o in q.options" :key="o.option" class="bar-row">
              <span class="bar-label bar-label-wide">{{ o.option }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: pct(o.count, q.answered) }" /></div>
              <span class="bar-count">{{ o.count }}</span>
            </div>
          </template>

          <template v-else-if="q.texts">
            <div v-if="q.texts.length === 0" class="text-muted" style="font-size: 14px;">{{ t.noText }}</div>
            <div v-for="(a, i) in q.texts" :key="i" class="text-answer">
              <p class="mb-1" style="white-space: pre-line;">{{ a.text }}</p>
              <p class="meta mb-0">{{ a.name }}</p>
            </div>
          </template>
          <p v-else class="meta mb-0">{{ t.textHidden }}</p>
        </v-card>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface QuestionResult {
  id: string
  type: 'rating' | 'text' | 'choice' | 'multi'
  label: string
  answered: number
  average?: number | null
  distribution?: number[]
  scale?: number
  options?: { option: string; count: number }[]
  texts?: { name: string; text: string }[]
}

interface Results {
  id: string
  title: string
  status: 'draft' | 'open' | 'closed'
  isOpen: boolean
  lang: 'nb' | 'en'
  full: boolean
  responseCount: number
  questions: QuestionResult[]
}

// The board view stays Norwegian; the respondent view follows the survey's language.
const COPY = {
  nb: {
    back: 'Tilbake til undersøkelsen',
    responses: (n: number) => `${n} svar`,
    answered: (n: number) => `${n} har svart på dette`,
    open: 'åpen',
    closed: 'lukket',
    boardNote:
      'Styrevisning. Fritekstsvar vises med navn, fordi vi er en liten krets som bygger på tillit. Del dem ikke videre med navn.',
    memberNote: 'Du ser samlede tall uten navn. Fritekstsvarene ser bare styret.',
    none: 'Ingen har svart ennå.',
    noText: 'Ingen har skrevet noe her.',
    textHidden: 'Fritekst, synlig for styret.',
    loadFailed: 'Kunne ikke hente resultatene.',
  },
  en: {
    back: 'Back to the survey',
    responses: (n: number) => `${n} ${n === 1 ? 'response' : 'responses'}`,
    answered: (n: number) => `${n} answered this`,
    open: 'open',
    closed: 'closed',
    boardNote:
      'Board view. Free-text answers show names, because we are a small circle built on trust. Do not pass them on with names.',
    memberNote: 'You see totals without names. Only the board sees the free-text answers.',
    none: 'No responses yet.',
    noText: 'Nobody wrote anything here.',
    textHidden: 'Free text, visible to the board.',
    loadFailed: 'Could not load the results.',
  },
}

const route = useRoute()
const { session, checked } = useAuthSession()

const results = ref<Results | null>(null)
const loading = ref(true)
const loadError = ref('')

const t = computed(() => COPY[results.value && !results.value.full ? results.value.lang : 'nb'])

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    results.value = await $fetch<Results>(`/api/member/surveys/${route.params.id}/results`)
  } catch (err: any) {
    loadError.value = err?.statusCode === 403 ? err?.data?.message : COPY.nb.loadFailed
  } finally {
    loading.value = false
  }
}

function pct(count: number, total: number): string {
  return total ? `${Math.round((count / total) * 100)}%` : '0%'
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})
</script>

<style scoped>
.member-survey-results {
  line-height: 1.7;
}

.back-link {
  color: #fff;
  font-size: 14px;
  text-decoration: underline;
}

.text-muted {
  opacity: 0.7;
}

.question-label {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.meta {
  color: #888;
  font-size: 13px;
}

.average {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.average-of {
  font-size: 1rem;
  font-weight: 400;
  color: #888;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #ccc;
  margin-bottom: 4px;
}

.bar-label {
  width: 1.5rem;
  flex-shrink: 0;
}

.bar-label-wide {
  width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  flex: 1;
  height: 10px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  max-width: 360px;
}

.bar-fill {
  height: 100%;
  background: #fff;
  border-radius: 2px;
}

.bar-count {
  width: 2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.text-answer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 0;
  color: #ddd;
  font-size: 14px;
}

.text-answer:first-of-type {
  border-top: 0;
  padding-top: 0;
}
</style>
