<template>
  <div class="admission-vote text-left">
    <NuxtLink to="/member/sweden/admission" class="back">← {{ t('swedenAdmission.title') }}</NuxtLink>
    <v-alert v-if="preview" type="warning" variant="tonal" class="mt-3 text-left" style="max-width: 640px;" data-test="sweden-admission-preview">
      <strong>{{ t('swedenAdmission.preview.label') }}.</strong> {{ t('swedenAdmission.preview.hint') }}
    </v-alert>

    <div v-if="loading" class="text-center py-6"><v-progress-circular indeterminate color="white" /></div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>
    <template v-else-if="vote">
      <header class="mb-6 mt-3">
        <p class="eyebrow mb-1">{{ t('swedenAdmission.vote.eyebrow') }}</p>
        <h1 class="font-weight-bold mb-1" style="font-size: 1.6rem;" data-test="sweden-admission-candidate-name">{{ vote.candidate.name }}</h1>
        <p class="meta mb-2">
          <template v-if="vote.candidate.roleTitle || vote.candidate.org">{{ [vote.candidate.roleTitle, vote.candidate.org].filter(Boolean).join(', ') }}</template>
          <template v-if="vote.candidate.linkedin">
            <template v-if="vote.candidate.roleTitle || vote.candidate.org"> · </template>
            <a :href="vote.candidate.linkedin" target="_blank" rel="noopener" class="link">LinkedIn</a>
          </template>
        </p>
        <div class="d-flex align-center flex-wrap" style="gap: 8px;">
          <span class="tag" :class="`tag-${vote.state}`" data-test="sweden-admission-state">{{ t(`admission.state.${vote.state}`) }}</span>
          <span class="meta">
            <template v-if="vote.state === 'open'">{{ t('admission.votes.closes', { date: formatDate(vote.closesAt, 'long') }) }} · </template>
            {{ t('admission.turnout', { voted: vote.turnout.voted, roster: vote.turnout.roster }) }}
          </span>
        </div>
      </header>

      <!-- Result, once closed -->
      <section v-if="vote.result" class="panel mb-6" data-test="sweden-admission-result">
        <h2 class="section-title">{{ t('admission.result.title') }}</h2>
        <p class="outcome mb-3" :class="`outcome-${vote.result.outcome}`">{{ t(`admission.outcome.${vote.result.outcome}`) }}</p>
        <div class="counts mb-3">
          <div><span class="count">{{ vote.result.yes }}</span><span class="label">{{ t('admission.choice.yes') }}</span></div>
          <div><span class="count">{{ vote.result.no }}</span><span class="label">{{ t('admission.choice.no') }}</span></div>
          <div><span class="count">{{ vote.result.blank }}</span><span class="label">{{ t('admission.choice.blank') }}</span></div>
        </div>
        <p class="meta mb-1">
          {{ t('admission.result.basis', { cast: vote.result.yes + vote.result.no }) }}
          <template v-if="vote.result.needed !== null"> {{ t('swedenAdmission.result.needed', { n: vote.result.needed }) }}</template>
        </p>
        <p v-if="vote.result.outcome === 'passed'" class="meta mb-0">{{ t('swedenAdmission.result.nextPassed') }}</p>
      </section>

      <p v-if="vote.state === 'cancelled'" class="panel mb-6 meta">{{ t('swedenAdmission.vote.cancelled') }}</p>

      <!-- Ballot -->
      <section v-if="vote.state === 'open' && vote.onRoster && !preview" class="panel mb-6" data-test="sweden-admission-ballot">
        <template v-if="!vote.hasVoted">
          <h2 class="section-title">{{ t('swedenAdmission.vote.question', { name: vote.candidate.name }) }}</h2>
          <div class="choices mb-4">
            <button
              v-for="c in choices"
              :key="c"
              type="button"
              class="choice"
              :class="{ selected: picked === c, [`choice-${c}`]: true }"
              :data-test="`sweden-admission-choice-${c}`"
              @click="picked = c"
            >
              {{ t(`admission.choice.${c}`) }}
            </button>
          </div>
          <v-textarea
            v-model="note"
            :label="t('swedenAdmission.vote.note')"
            :hint="t('swedenAdmission.vote.noteHint')"
            persistent-hint
            :counter="NOTE_MAX"
            :maxlength="NOTE_MAX"
            variant="outlined"
            density="comfortable"
            rows="3"
            auto-grow
            class="mb-4"
            data-test="sweden-admission-note"
          />
          <p class="meta mb-3">{{ t('swedenAdmission.vote.secretFinal') }}</p>
          <v-btn
            :disabled="!picked"
            :loading="saving"
            style="background-color: white; color: #111;"
            data-test="sweden-admission-cast"
            @click="cast"
          >
            {{ picked ? t('swedenAdmission.vote.castAs', { choice: t(`admission.choice.${picked}`) }) : t('swedenAdmission.vote.cast') }}
          </v-btn>
        </template>
        <div v-else data-test="sweden-admission-voted">
          <h2 class="section-title mb-1">{{ t('swedenAdmission.vote.thanks') }}</h2>
          <p class="meta mb-0">{{ t('swedenAdmission.vote.votedSecret') }}</p>
        </div>
      </section>
      <p v-else-if="vote.state === 'open' && !vote.onRoster" class="panel mb-6 meta">{{ t('swedenAdmission.vote.notOnRoster') }}</p>

      <!-- The applicant as the managers put them forward -->
      <section class="mb-6">
        <h2 class="section-title">{{ t('swedenAdmission.vote.managerNote') }}</h2>
        <p class="body">{{ vote.managerNote || t('swedenAdmission.vote.noManagerNote') }}</p>
        <template v-if="vote.candidate.whyJoin">
          <h2 class="section-title mt-5">{{ t('swedenAdmission.vote.whyJoin') }}</h2>
          <p class="body quote">{{ vote.candidate.whyJoin }}</p>
        </template>
        <p class="meta mt-3 mb-0">{{ t('swedenAdmission.vote.startedBy', { name: vote.openedBy, date: formatDate(vote.openedAt, 'long') }) }}</p>
      </section>

      <section class="mb-6">
        <h2 class="section-title">{{ t('swedenAdmission.vote.howTitle') }}</h2>
        <p class="meta mb-0">{{ t('swedenAdmission.vote.how') }}</p>
      </section>

      <!-- Managers -->
      <section v-if="vote.manager" class="panel board mb-6" data-test="sweden-admission-manager">
        <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
          <h2 class="section-title mb-0">{{ t('swedenAdmission.manager.title') }}</h2>
          <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
            {{ t('swedenAdmission.manager.badge') }}
          </v-chip>
        </div>
        <p class="meta mb-3">{{ t('swedenAdmission.manager.application', { status: t(`admission.board.join.${vote.manager.joinStatus}`) }) }}</p>
        <div v-if="vote.state === 'open'" class="d-flex flex-wrap mb-4" style="gap: 12px;">
          <v-btn variant="outlined" :loading="saving" data-test="sweden-admission-close" @click="act('close')">{{ t('swedenAdmission.manager.closeNow') }}</v-btn>
          <v-btn variant="text" :disabled="saving" @click="act('cancel')">{{ t('swedenAdmission.manager.cancel') }}</v-btn>
        </div>
        <h3 class="section-title" style="font-size: 1rem;">{{ t('swedenAdmission.manager.notesTitle') }}</h3>
        <template v-if="vote.manager.notes">
          <p v-if="vote.manager.notes.length === 0" class="meta mb-0">{{ t('swedenAdmission.manager.notesNone') }}</p>
          <template v-else>
            <p class="meta mb-3">{{ t('swedenAdmission.manager.notesHint') }}</p>
            <div v-for="(n, i) in vote.manager.notes" :key="i" class="note-item" data-test="sweden-admission-note-item">
              <span class="tag">{{ t(`admission.choice.${n.choice}`) }}</span>
              <p class="body">{{ n.note }}</p>
            </div>
          </template>
        </template>
        <p v-else class="meta mb-0">{{ t('swedenAdmission.manager.notesLater') }}</p>
      </section>

      <v-alert v-if="actionError" type="warning" variant="outlined" class="text-left">{{ actionError }}</v-alert>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

// One Sweden admission vote (server/utils/swedenAdmission.ts): the ballot with its note,
// the result once closed, and for the managers the notes (no author) after it closes.

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
  result: { yes: number; no: number; blank: number; outcome: string; needed: number | null } | null
  candidate: {
    name: string
    linkedin: string | null
    org: string | null
    roleTitle: string | null
    whyJoin: string | null
  }
  managerNote: string | null
  openedBy: string
  manager: { closedBy: string | null; joinStatus: string; notes: { choice: Choice; note: string }[] | null } | null
}

// The server's limit (swedenAdmissionRules.ts NOTE_MAX, hq 051 CHECK).
const NOTE_MAX = 2000

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const { visible, preview } = useSwedenAdmissionFlag()
const route = useRoute()

const choices: Choice[] = ['yes', 'no', 'blank']
const vote = ref<Vote | null>(null)
const loading = ref(true)
const loadError = ref('')
const picked = ref<Choice | null>(null)
const note = ref('')
const saving = ref(false)
const actionError = ref('')

const url = computed(() => `/api/member/sweden/admission/votes/${route.params.id}`)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    vote.value = await $fetch<Vote>(url.value)
  } catch (err: any) {
    loadError.value = err?.statusCode === 404 ? t('swedenAdmission.errors.notFound') : t('swedenAdmission.errors.load')
  } finally {
    loading.value = false
  }
}

async function cast() {
  if (!picked.value) return
  saving.value = true
  actionError.value = ''
  try {
    vote.value = await $fetch<Vote>(`${url.value}/ballot`, {
      method: 'POST',
      body: { choice: picked.value, note: note.value },
    })
    note.value = ''
  } catch (err: any) {
    actionError.value = err?.data?.message || t('swedenAdmission.errors.action')
  } finally {
    saving.value = false
  }
}

async function act(action: 'close' | 'cancel') {
  if (action === 'cancel' && !confirm(t('swedenAdmission.manager.cancelConfirm'))) return
  saving.value = true
  actionError.value = ''
  try {
    vote.value = await $fetch<Vote>(`${url.value}/${action}`, { method: 'POST' })
  } catch (err: any) {
    actionError.value = err?.data?.message || t('swedenAdmission.errors.action')
  } finally {
    saving.value = false
  }
}

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
.note-item {
  border-left: 3px solid #444;
  padding: 4px 0 4px 12px;
  margin-bottom: 12px;
}
.note-item .body {
  margin: 4px 0 0;
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
