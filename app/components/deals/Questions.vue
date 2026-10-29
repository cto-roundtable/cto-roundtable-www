<template>
  <section class="panel">
    <h2 class="panel-title mb-1">{{ t('deals.qa.title') }}</h2>
    <p class="meta mb-4">{{ t('deals.qa.intro') }}</p>

    <form class="ask mb-5" @submit.prevent="ask">
      <v-textarea
        v-model="draft"
        :label="t('deals.qa.askLabel')"
        :counter="MAX_QUESTION"
        :maxlength="MAX_QUESTION"
        rows="3"
        auto-grow
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        theme="dark"
      />
      <div class="d-flex align-center flex-wrap mt-3" style="gap: 12px;">
        <v-btn
          type="submit"
          :loading="asking"
          :disabled="!draft.trim()"
          style="background-color: white; color: #111;"
        >
          {{ t('deals.qa.askSubmit') }}
        </v-btn>
        <span v-if="asked" class="ok-note">{{ t('deals.qa.asked') }}</span>
      </div>
      <v-alert v-if="askError" type="warning" variant="outlined" density="compact" class="mt-3">{{ askError }}</v-alert>
    </form>

    <p v-if="!questions.length" class="meta">{{ t('deals.qa.empty') }}</p>

    <article v-for="q in sorted" :id="`q-${q.id}`" :key="q.id" class="question">
      <p class="q-body">{{ q.body }}</p>
      <p class="meta mb-2">{{ askedLine(q) }}</p>

      <template v-if="q.answer">
        <span class="label" :class="labelClass(q.answer)">{{ answerLabel(q.answer) }}</span>
        <!-- Rendered from a strict, escape-first markdown subset (no raw HTML). -->
        <div class="a-body mt-2" v-html="renderMarkdown(q.answer.bodyMd)" />
        <div v-if="q.answer.sources.length" class="sources mt-2">
          <p class="sources-label mb-1">{{ t('deals.qa.sources') }}</p>
          <p v-for="(s, i) in q.answer.sources" :key="i" class="source">
            <span class="source-file">{{ s.anchor ? `${s.file} · ${s.anchor}` : s.file }}</span>
            <span v-if="s.quote" class="source-quote">«{{ s.quote }}»</span>
          </p>
        </div>
      </template>
      <p v-else class="pending">{{ pendingLine(q) }}</p>

      <div v-if="canAnswer && q.status !== 'closed'" class="staff mt-3">
        <div class="d-flex flex-wrap" style="gap: 8px;">
          <v-btn
            v-if="q.answer && q.answer.byKind === 'agent' && !q.answer.confirmed"
            size="small"
            variant="outlined"
            :loading="busy === `confirm-${q.id}`"
            @click="act(q, 'confirm')"
          >
            {{ t('deals.qa.confirm') }}
          </v-btn>
          <v-btn size="small" variant="outlined" @click="toggleAnswer(q)">
            {{ q.answer ? t('deals.qa.correct') : t('deals.qa.answer') }}
          </v-btn>
          <v-btn size="small" variant="text" :loading="busy === `close-${q.id}`" @click="act(q, 'close')">
            {{ t('deals.qa.close') }}
          </v-btn>
        </div>
        <form v-if="answering === q.id" class="mt-3" @submit.prevent="answer(q)">
          <v-textarea
            v-model="answerDraft"
            :label="t('deals.qa.answerLabel')"
            rows="3"
            auto-grow
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            theme="dark"
          />
          <v-checkbox v-model="fromFounder" :label="t('deals.qa.fromFounder')" density="compact" hide-details theme="dark" />
          <v-btn
            type="submit"
            size="small"
            :loading="busy === `answer-${q.id}`"
            :disabled="!answerDraft.trim()"
            style="background-color: white; color: #111;"
          >
            {{ t('deals.qa.answerSubmit') }}
          </v-btn>
        </form>
      </div>
      <v-alert v-if="actError && actErrorFor === q.id" type="warning" variant="outlined" density="compact" class="mt-3">
        {{ actError }}
      </v-alert>
    </article>

    <p v-if="waiting > 0" class="meta mt-3">{{ t('deals.qa.waiting', waiting) }}</p>
  </section>
</template>

<script setup lang="ts">
// Q&A on a case. Members ask and read answers; who asked is shown to the committee
// only (server/utils/dealQuestions.ts decides what each viewer gets). The deal
// owner, the committee and the board answer, confirm an agent's answer, or close.
interface Answer {
  id: string
  bodyMd: string
  sources: { file: string; anchor?: string; quote?: string }[]
  byKind: 'agent' | 'owner' | 'founder_via_owner'
  confirmed: boolean
  createdAt: string
  byName?: string | null
  confirmedByName?: string | null
}
interface Question {
  id: string
  body: string
  status: string
  createdAt: string
  mine: boolean
  answer: Answer | null
  askedBy?: { id: string; name: string }
  routedTo?: { id: string; name: string } | null
  routeNote?: string | null
}

const props = defineProps<{
  slug: string
  questions: Question[]
  waiting: number
  canAnswer: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const MAX_QUESTION = 4000
const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { $posthog } = useNuxtApp()

const draft = ref('')
const asking = ref(false)
const asked = ref(false)
const askError = ref('')
const answering = ref<string | null>(null)
const answerDraft = ref('')
const fromFounder = ref(false)
const busy = ref<string | null>(null)
const actError = ref('')
const actErrorFor = ref<string | null>(null)

// Whoever answers sees what waits for an answer first; members read in the order asked.
const sorted = computed(() => {
  if (!props.canAnswer) return props.questions
  const needs = (q: Question) =>
    q.status === 'closed' ? 2 : !q.answer || (q.answer.byKind === 'agent' && !q.answer.confirmed) ? 0 : 1
  return [...props.questions].sort((a, b) => needs(a) - needs(b))
})

function errorText(e: any) {
  return e?.data?.message || e?.message || t('deals.qa.error')
}

async function ask() {
  askError.value = ''
  asked.value = false
  asking.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/questions`, { method: 'POST', body: { body: draft.value } })
    draft.value = ''
    asked.value = true
    $posthog?.capture?.('deal_question_asked', { slug: props.slug })
    emit('changed')
  } catch (e: any) {
    askError.value = errorText(e)
  } finally {
    asking.value = false
  }
}

function toggleAnswer(q: Question) {
  answering.value = answering.value === q.id ? null : q.id
  answerDraft.value = ''
  fromFounder.value = false
}

async function post(q: Question, action: string, body?: Record<string, unknown>) {
  actError.value = ''
  actErrorFor.value = null
  busy.value = `${action}-${q.id}`
  try {
    await $fetch(`/api/member/deals/${props.slug}/questions/${q.id}/${action}`, { method: 'POST', body: body ?? {} })
    emit('changed')
    return true
  } catch (e: any) {
    actError.value = errorText(e)
    actErrorFor.value = q.id
    return false
  } finally {
    busy.value = null
  }
}

async function act(q: Question, action: 'confirm' | 'close') {
  await post(q, action)
}

async function answer(q: Question) {
  if (await post(q, 'answer', { bodyMd: answerDraft.value, fromFounder: fromFounder.value })) {
    answering.value = null
  }
}

function askedLine(q: Question) {
  const date = formatDate(q.createdAt, 'short')
  if (q.askedBy) return t('deals.qa.askedBy', { name: q.askedBy.name, date })
  return q.mine ? t('deals.qa.askedByYou', { date }) : t('deals.qa.askedOn', { date })
}

function pendingLine(q: Question) {
  if (q.status === 'closed') return t('deals.qa.status.closed')
  if (q.status === 'routed') {
    if (q.routedTo) {
      return q.routeNote
        ? t('deals.qa.routedToNote', { name: q.routedTo.name, note: q.routeNote })
        : t('deals.qa.routedTo', { name: q.routedTo.name })
    }
    return t('deals.qa.status.routed')
  }
  if (q.status === 'founder_asked') return t('deals.qa.status.founder_asked')
  return q.mine ? t('deals.qa.status.new') : t('deals.qa.status.newOther')
}

function answerLabel(a: Answer) {
  if (a.byKind === 'agent') {
    if (!a.confirmed) return t('deals.qa.label.agent')
    return a.confirmedByName
      ? t('deals.qa.label.agentConfirmedBy', { name: a.confirmedByName })
      : t('deals.qa.label.agentConfirmed')
  }
  if (a.byKind === 'founder_via_owner') return t('deals.qa.label.founder')
  return a.byName ? t('deals.qa.label.ownerNamed', { name: a.byName }) : t('deals.qa.label.owner')
}

function labelClass(a: Answer) {
  return a.byKind === 'agent' && !a.confirmed ? 'label-unchecked' : 'label-checked'
}
</script>

<style scoped>
.panel {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 32px 0 28px;
}
.panel-title {
  font-size: 1.2rem;
  font-weight: 650;
  color: #fff;
}
.meta {
  color: #888;
  font-size: 13px;
}
.ok-note {
  color: #81c784;
  font-size: 13px;
}
.question {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 16px 0 4px;
  scroll-margin-top: 88px;
}
.q-body {
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  white-space: pre-wrap;
  margin-bottom: 4px;
}
.pending {
  color: #aaa;
  font-size: 13px;
  font-style: italic;
}
.label {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 3px 8px;
}
.label-unchecked {
  color: #ffcc80;
  border: 1px solid rgba(255, 204, 128, 0.5);
}
.label-checked {
  color: #a5d6a7;
  border: 1px solid rgba(165, 214, 167, 0.5);
}
.a-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
}
.a-body :deep(p) {
  margin: 0 0 10px;
}
.a-body :deep(ul) {
  margin: 0 0 10px;
  padding-left: 20px;
}
.a-body :deep(a) {
  color: #64b5f6;
}
.sources {
  border-left: 2px solid rgba(255, 255, 255, 0.15);
  padding-left: 10px;
}
.sources-label {
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.source {
  font-size: 12.5px;
  color: #aaa;
  margin: 0 0 4px;
}
.source-file {
  color: #ccc;
  margin-right: 6px;
}
.source-quote {
  font-style: italic;
}
</style>
