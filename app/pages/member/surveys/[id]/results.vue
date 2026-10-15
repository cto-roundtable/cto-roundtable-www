<template>
  <div class="member-survey-results text-left">
    <NuxtLink :to="`/member/surveys/${route.params.id}`" class="back-link mb-4 d-inline-block">← {{ t('member.surveys.results.back') }}</NuxtLink>

    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="white" />
    </div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>

    <template v-else-if="results">
      <header class="mb-6">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ results.title }}</h1>
        <p class="mb-1" style="color: #aaa; font-size: 14px;">
          {{ t('member.surveys.responses', results.responseCount) }} ·
          {{ results.isOpen ? t('member.surveys.results.open') : t('member.surveys.results.closed') }}
        </p>
        <p class="mt-3 mb-0" style="color: #aaa; font-size: 13px; line-height: 1.6; max-width: 640px;">
          {{ results.full ? t('member.surveys.results.boardNote') : t('member.surveys.results.memberNote') }}
        </p>
      </header>

      <div v-if="results.responseCount === 0" class="text-muted" style="font-size: 15px;">{{ t('member.surveys.results.none') }}</div>

      <div v-else class="d-flex flex-column" style="gap: 16px;">
        <v-card v-for="q in results.questions" :key="q.id" variant="outlined" class="pa-4">
          <p class="question-label mb-1">{{ q.label }}</p>
          <p class="meta mb-3">{{ t('member.surveys.results.answered', { count: q.answered }) }}</p>

          <template v-if="q.type === 'rating'">
            <p class="average mb-2">
              {{ q.average == null ? '-' : n(q.average, { maximumFractionDigits: 2 }) }}<span class="average-of"> / {{ q.scale }}</span>
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
            <div v-if="q.texts.length === 0" class="text-muted" style="font-size: 14px;">{{ t('member.surveys.results.noText') }}</div>
            <div v-for="(a, i) in q.texts" :key="i" class="text-answer">
              <p class="mb-1" style="white-space: pre-line;">{{ a.text }}</p>
              <p class="meta mb-0">{{ a.name }}</p>
            </div>
          </template>
          <p v-else class="meta mb-0">{{ t('member.surveys.results.textHidden') }}</p>
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

const route = useRoute()
const { t, n } = useI18n()
const { session, checked } = useAuthSession()

const results = ref<Results | null>(null)
const loading = ref(true)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    results.value = await $fetch<Results>(`/api/member/surveys/${route.params.id}/results`)
  } catch (err: any) {
    loadError.value = err?.statusCode === 403 ? err?.data?.message : t('member.surveys.results.loadFailed')
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
