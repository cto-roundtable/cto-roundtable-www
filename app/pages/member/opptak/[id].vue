<template>
  <div class="admission-vote text-left">
    <NuxtLink to="/member/opptak" class="back">← {{ t('admission.title') }}</NuxtLink>
    <v-alert v-if="preview" type="warning" variant="tonal" class="mt-3 text-left" style="max-width: 640px;" data-test="admission-preview">
      <strong>{{ t('admission.preview.label') }}.</strong> {{ t('admission.preview.hint') }}
    </v-alert>

    <div v-if="loading" class="text-center py-6"><v-progress-circular indeterminate color="white" /></div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>
    <template v-else-if="vote">
      <header class="mb-6 mt-3">
        <p class="eyebrow mb-1">{{ t('admission.vote.eyebrow') }}</p>
        <h1 class="font-weight-bold mb-1" style="font-size: 1.6rem;" data-test="admission-candidate-name">{{ vote.candidate.name }}</h1>
        <p class="meta mb-2">
          <template v-if="vote.candidate.roleTitle || vote.candidate.org">{{ [vote.candidate.roleTitle, vote.candidate.org].filter(Boolean).join(', ') }}</template>
          <template v-if="vote.candidate.linkedin">
            <template v-if="vote.candidate.roleTitle || vote.candidate.org"> · </template>
            <a :href="vote.candidate.linkedin" target="_blank" rel="noopener" class="link">LinkedIn</a>
          </template>
        </p>
        <div class="d-flex align-center flex-wrap" style="gap: 8px;">
          <span class="tag" :class="`tag-${vote.state}`" data-test="admission-state">{{ t(`admission.state.${vote.state}`) }}</span>
          <span class="meta">
            <template v-if="vote.state === 'open'">{{ t('admission.votes.closes', { date: formatDate(vote.closesAt, 'long') }) }} · </template>
            {{ t('admission.turnout', { voted: vote.turnout.voted, roster: vote.turnout.roster }) }}
          </span>
        </div>
      </header>

      <!-- Result, once closed -->
      <section v-if="vote.result" class="panel mb-6" data-test="admission-result">
        <h2 class="section-title">{{ t('admission.result.title') }}</h2>
        <p class="outcome mb-3" :class="`outcome-${finalOutcome}`">{{ t(`admission.outcome.${finalOutcome}`) }}</p>
        <div class="counts mb-3">
          <div><span class="count">{{ vote.result.yes }}</span><span class="label">{{ t('admission.choice.yes') }}</span></div>
          <div><span class="count">{{ vote.result.no }}</span><span class="label">{{ t('admission.choice.no') }}</span></div>
          <div><span class="count">{{ vote.result.blank }}</span><span class="label">{{ t('admission.choice.blank') }}</span></div>
        </div>
        <p class="meta mb-1">
          {{ t('admission.result.basis', { cast: vote.result.yes + vote.result.no }) }}
          <template v-if="vote.result.needed !== null"> {{ t('admission.result.needed', { n: vote.result.needed }) }}</template>
        </p>
        <p v-if="vote.result.lot" class="meta mb-1">{{ t('admission.result.lot', { note: vote.result.lot.note, name: vote.result.lot.by }) }}</p>
        <p v-if="finalOutcome === 'passed'" class="meta mb-0">{{ t('admission.result.nextPassed') }}</p>
      </section>

      <p v-if="vote.state === 'cancelled'" class="panel mb-6 meta">{{ t('admission.vote.cancelled') }}</p>

      <!-- Ballot -->
      <section v-if="vote.state === 'open' && vote.onRoster && !preview" class="panel mb-6" data-test="admission-ballot">
        <template v-if="!vote.hasVoted">
          <h2 class="section-title">{{ t('admission.vote.question', { name: vote.candidate.name }) }}</h2>
          <div class="choices mb-3">
            <button
              v-for="c in choices"
              :key="c"
              type="button"
              class="choice"
              :class="{ selected: picked === c, [`choice-${c}`]: true }"
              :data-test="`admission-choice-${c}`"
              @click="picked = c"
            >
              {{ t(`admission.choice.${c}`) }}
            </button>
          </div>
          <p class="meta mb-3">{{ t('admission.vote.secretFinal') }}</p>
          <v-btn
            :disabled="!picked"
            :loading="saving"
            style="background-color: white; color: #111;"
            data-test="admission-cast"
            @click="cast"
          >
            {{ picked ? t('admission.vote.castAs', { choice: t(`admission.choice.${picked}`) }) : t('admission.vote.cast') }}
          </v-btn>
        </template>
        <div v-else data-test="admission-voted">
          <h2 class="section-title mb-1">{{ t('admission.vote.thanks') }}</h2>
          <p class="meta mb-0">{{ t('admission.vote.votedSecret') }}</p>
        </div>
      </section>
      <p v-else-if="vote.state === 'open' && !vote.onRoster" class="panel mb-6 meta">{{ t('admission.vote.notOnRoster') }}</p>

      <!-- The candidate as the board put them forward -->
      <section class="mb-6">
        <h2 class="section-title">{{ t('admission.vote.boardNote') }}</h2>
        <p class="body">{{ vote.boardNote || t('admission.vote.noBoardNote') }}</p>
        <template v-if="vote.candidate.whyJoin">
          <h2 class="section-title mt-5">{{ t('admission.vote.whyJoin') }}</h2>
          <p class="body quote">{{ vote.candidate.whyJoin }}</p>
        </template>
        <p v-if="vote.candidate.invitedBy" class="meta mt-3">{{ t('admission.candidates.invitedBy', { name: vote.candidate.invitedBy }) }}</p>
        <p class="meta mt-3 mb-0">{{ t('admission.vote.startedBy', { name: vote.openedBy, date: formatDate(vote.openedAt, 'long') }) }}</p>
      </section>

      <section class="mb-6">
        <h2 class="section-title">{{ t('admission.vote.howTitle') }}</h2>
        <p class="meta mb-0">{{ t('admission.vote.how') }}</p>
      </section>

      <!-- Board -->
      <section v-if="vote.board" class="panel board mb-6" data-test="admission-board">
        <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
          <h2 class="section-title mb-0">{{ t('admission.board.title') }}</h2>
          <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
            {{ t('common.board') }}
          </v-chip>
        </div>
        <p class="meta mb-3">{{ t('admission.board.application', { status: t(`admission.board.join.${vote.board.joinStatus}`) }) }}</p>
        <div v-if="vote.state === 'open'" class="d-flex flex-wrap" style="gap: 12px;">
          <v-btn variant="outlined" :loading="saving" data-test="admission-close" @click="act('close')">{{ t('admission.board.closeNow') }}</v-btn>
          <v-btn variant="text" :disabled="saving" @click="act('cancel')">{{ t('admission.board.cancel') }}</v-btn>
        </div>
        <div v-if="vote.result?.outcome === 'tie' && !vote.result.lot" style="max-width: 520px;">
          <p class="meta mb-2">{{ t('admission.board.lotHint') }}</p>
          <v-text-field v-model="lotNote" :label="t('admission.board.lotNote')" variant="outlined" density="comfortable" hide-details class="mb-3" />
          <div class="d-flex flex-wrap" style="gap: 12px;">
            <v-btn variant="outlined" :disabled="!lotNote.trim()" :loading="saving" @click="lot('passed')">{{ t('admission.board.lotPassed') }}</v-btn>
            <v-btn variant="outlined" :disabled="!lotNote.trim()" :loading="saving" @click="lot('failed')">{{ t('admission.board.lotFailed') }}</v-btn>
          </div>
        </div>
      </section>

      <v-alert v-if="actionError" type="warning" variant="outlined" class="text-left">{{ actionError }}</v-alert>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

type Choice = 'yes' | 'no' | 'blank'
interface Vote {
  id: string
  candidateName: string
  state: 'open' | 'due' | 'closed' | 'cancelled'
  openedAt: string
  closesAt: string
  closedAt: string | null
  onRoster: boolean
  hasVoted: boolean
  turnout: { voted: number; roster: number }
  result: {
    yes: number
    no: number
    blank: number
    outcome: string
    needed: number | null
    lot: { outcome: string; note: string; by: string } | null
  } | null
  candidate: {
    name: string
    linkedin: string | null
    org: string | null
    roleTitle: string | null
    whyJoin: string | null
    invitedBy: string | null
  }
  boardNote: string | null
  openedBy: string
  board: { closedBy: string | null; joinStatus: string } | null
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const { visible, preview } = useAdmissionsFlag()
const route = useRoute()

const choices: Choice[] = ['yes', 'no', 'blank']
const vote = ref<Vote | null>(null)
const loading = ref(true)
const loadError = ref('')
const picked = ref<Choice | null>(null)
const saving = ref(false)
const actionError = ref('')
const lotNote = ref('')

const finalOutcome = computed(() => {
  const r = vote.value?.result
  if (!r) return null
  return r.outcome === 'tie' && r.lot ? r.lot.outcome : r.outcome
})

const url = computed(() => `/api/member/admission/votes/${route.params.id}`)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    vote.value = await $fetch<Vote>(url.value)
  } catch (err: any) {
    loadError.value = err?.statusCode === 404 ? t('admission.errors.notFound') : t('admission.errors.load')
  } finally {
    loading.value = false
  }
}

async function cast() {
  if (!picked.value) return
  saving.value = true
  actionError.value = ''
  try {
    vote.value = await $fetch<Vote>(`${url.value}/ballot`, { method: 'POST', body: { choice: picked.value } })
  } catch (err: any) {
    actionError.value = err?.data?.message || t('admission.errors.action')
  } finally {
    saving.value = false
  }
}

async function act(action: 'close' | 'cancel') {
  if (action === 'cancel' && !confirm(t('admission.board.cancelConfirm'))) return
  saving.value = true
  actionError.value = ''
  try {
    vote.value = await $fetch<Vote>(`${url.value}/${action}`, { method: 'POST' })
  } catch (err: any) {
    actionError.value = err?.data?.message || t('admission.errors.action')
  } finally {
    saving.value = false
  }
}

async function lot(outcome: 'passed' | 'failed') {
  saving.value = true
  actionError.value = ''
  try {
    vote.value = await $fetch<Vote>(`${url.value}/lot`, { method: 'POST', body: { outcome, note: lotNote.value } })
  } catch (err: any) {
    actionError.value = err?.data?.message || t('admission.errors.action')
  } finally {
    saving.value = false
  }
}

// Flag off (server/utils/admissionsFlag.ts): the page does not exist for members.
watchEffect(() => {
  if (checked.value && session.value.authenticated && !visible.value) {
    showError({ statusCode: 404, statusMessage: 'Not found' })
  }
})

watchEffect(() => {
  if (checked.value && session.value.authenticated && visible.value) load()
})
</script>

<style scoped>
.back {
  color: #999;
  font-size: 14px;
  text-decoration: none;
}
.eyebrow {
  color: #999;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.meta {
  color: #999;
  font-size: 14px;
  line-height: 1.6;
}
.link {
  color: #90caf9;
  text-decoration: none;
}
.section-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 10px;
}
.panel {
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 16px;
  max-width: 640px;
}
.panel.board {
  border-color: #4a3a6a;
}
.body {
  color: #ddd;
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-line;
  max-width: 640px;
}
.quote {
  border-left: 3px solid #444;
  padding-left: 12px;
  color: #ccc;
}
.choices {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.choice {
  min-width: 96px;
  padding: 12px 18px;
  border: 1px solid #444;
  border-radius: 4px;
  background: transparent;
  color: #eee;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.choice.selected.choice-yes {
  background: #2e7d32;
  border-color: #2e7d32;
}
.choice.selected.choice-no {
  background: #c62828;
  border-color: #c62828;
}
.choice.selected.choice-blank {
  background: #555;
  border-color: #777;
}
.counts {
  display: flex;
  gap: 28px;
}
.count {
  display: block;
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
}
.label {
  color: #999;
  font-size: 13px;
}
.outcome {
  font-size: 1.2rem;
  font-weight: 700;
}
.outcome-passed {
  color: #a5d6a7;
}
.outcome-failed,
.outcome-no_votes {
  color: #ef9a9a;
}
.outcome-tie {
  color: #d1c4e9;
}
.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  background: #2a2a2a;
  color: #ccc;
}
.tag-open {
  background: #ff9800;
  color: #111;
}
</style>
