<template>
  <div class="admission text-left">
    <v-alert v-if="preview" type="warning" variant="tonal" class="mb-6 text-left" style="max-width: 760px;" data-test="sweden-admission-preview">
      <strong>{{ t('swedenAdmission.preview.label') }}.</strong> {{ t('swedenAdmission.preview.hint') }}
    </v-alert>
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('swedenAdmission.title') }}</h1>
      <p class="intro">{{ t('swedenAdmission.intro') }}</p>
    </header>

    <div v-if="loading" class="text-center py-6"><v-progress-circular indeterminate color="white" /></div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>
    <template v-else>
      <!-- Votes: the ones this person is on the roster of, and every one for a manager -->
      <section class="mb-8" data-test="sweden-admission-votes">
        <h2 class="section-title">{{ t('swedenAdmission.votes.title') }}</h2>
        <p v-if="votes.length === 0" class="muted">{{ t('swedenAdmission.votes.none') }}</p>
        <div v-else class="feed">
          <NuxtLink v-for="v in votes" :key="v.id" :to="`/member/sweden/admission/${v.id}`" class="row-link" data-test="sweden-admission-vote-row">
            <div class="card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="name">{{ v.candidateName }}</span>
                <span class="tag" :class="`tag-${v.state}`">{{ t(`admission.state.${v.state}`) }}</span>
                <span v-if="v.state === 'closed' && v.result" class="tag" :class="`tag-${v.result.outcome}`">
                  {{ t(`admission.outcome.${v.result.outcome}`) }}
                </span>
                <span v-if="v.state === 'open' && v.onRoster && !v.hasVoted" class="tag tag-todo">{{ t('admission.votes.yourTurn') }}</span>
                <span v-if="v.hasVoted" class="tag">{{ t('admission.votes.voted') }}</span>
              </div>
              <p class="meta mb-0">
                <template v-if="v.state === 'open'">{{ t('admission.votes.closes', { date: formatDate(v.closesAt, 'long') }) }} · </template>
                <template v-else-if="v.closedAt">{{ t('admission.votes.closedOn', { date: formatDate(v.closedAt, 'long') }) }} · </template>
                {{ t('admission.turnout', { voted: v.turnout.voted, roster: v.turnout.roster }) }}
                <template v-if="v.result"> · {{ t('admission.result.short', { yes: v.result.yes, no: v.result.no, blank: v.result.blank }) }}</template>
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <template v-if="isManager">
        <!-- The applicants -->
        <section class="mb-8" data-test="sweden-admission-candidates">
          <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
            <h2 class="section-title mb-0">{{ t('swedenAdmission.candidates.title') }}</h2>
            <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
              {{ t('swedenAdmission.manager.badge') }}
            </v-chip>
          </div>
          <p class="muted mb-3">{{ t('swedenAdmission.candidates.hint') }}</p>
          <p v-if="candidates.length === 0" class="muted">{{ t('swedenAdmission.candidates.none') }}</p>
          <div v-else class="feed">
            <div v-for="c in candidates" :key="c.joinRequestId" class="card" data-test="sweden-admission-candidate">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="name">{{ c.name }}</span>
                <span v-if="c.rejoin" class="tag">{{ t('swedenAdmission.candidates.rejoin') }}</span>
                <span class="tag">{{ t(`admission.candidates.source.${c.source === 'form' ? 'form' : 'manual'}`) }}</span>
              </div>
              <p class="meta mb-1">
                <template v-if="c.roleTitle || c.org">{{ [c.roleTitle, c.org].filter(Boolean).join(', ') }} · </template>
                {{ t('swedenAdmission.candidates.since', { date: formatDate(c.since, 'short') }) }}
                <template v-if="c.linkedin"> · <a :href="c.linkedin" target="_blank" rel="noopener" class="link">LinkedIn</a></template>
              </p>
              <p v-if="c.whyJoin" class="why mb-2">{{ c.whyJoin }}</p>

              <NuxtLink v-if="c.liveVote" :to="`/member/sweden/admission/${c.liveVote.id}`" class="link">
                {{ t('swedenAdmission.candidates.running', { date: formatDate(c.liveVote.closesAt, 'long') }) }}
              </NuxtLink>
              <template v-else-if="c.votable">
                <v-btn
                  v-if="starting !== c.joinRequestId"
                  variant="outlined"
                  size="small"
                  prepend-icon="mdi-vote-outline"
                  :disabled="preview"
                  data-test="sweden-admission-start"
                  @click="openStart(c.joinRequestId)"
                >
                  {{ t('swedenAdmission.start.button') }}
                </v-btn>
                <div v-else class="start-form mt-2">
                  <v-textarea
                    v-model="startForm.note"
                    :label="t('swedenAdmission.start.note')"
                    :hint="t('swedenAdmission.start.noteHint')"
                    persistent-hint
                    variant="outlined"
                    density="comfortable"
                    rows="3"
                    auto-grow
                    class="mb-3"
                  />
                  <v-select
                    v-model="startForm.days"
                    :items="dayItems"
                    :label="t('swedenAdmission.start.window')"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    class="mb-3"
                    style="max-width: 240px;"
                  />
                  <p class="muted mb-3" style="font-size: 13px;">{{ t('swedenAdmission.start.rule', { n: activeVoters }) }}</p>
                  <div class="d-flex flex-wrap" style="gap: 12px;">
                    <v-btn :loading="saving" style="background-color: white; color: #111;" data-test="sweden-admission-start-confirm" @click="start(c.joinRequestId)">
                      {{ t('swedenAdmission.start.confirm') }}
                    </v-btn>
                    <v-btn variant="text" :disabled="saving" @click="starting = null">{{ t('common.cancel') }}</v-btn>
                  </div>
                </div>
              </template>
              <p v-else-if="c.rejoin" class="meta mb-0">{{ t('swedenAdmission.candidates.rejoinHint') }}</p>
            </div>
          </div>
          <v-alert v-if="actionError" type="warning" variant="outlined" class="mt-3 text-left">{{ actionError }}</v-alert>
        </section>

        <!-- Who votes, who manages -->
        <section v-if="roles" class="mb-8" data-test="sweden-admission-roles">
          <h2 class="section-title">{{ t('swedenAdmission.roles.title') }}</h2>
          <p class="muted mb-3">{{ t('swedenAdmission.roles.hint') }}</p>
          <div class="feed">
            <div class="card">
              <p class="meta mb-1">{{ t('swedenAdmission.roles.voters') }}</p>
              <p class="mb-0">
                <template v-for="(p, i) in roles.voters" :key="p.personId">
                  <template v-if="i > 0">, </template>{{ p.name }}<span v-if="!p.active" class="meta"> ({{ t('swedenAdmission.roles.inactive') }})</span>
                </template>
              </p>
            </div>
            <div class="card">
              <p class="meta mb-1">{{ t('swedenAdmission.roles.managers') }}</p>
              <p class="mb-0">{{ roles.managers.map((p) => p.name).join(', ') }}</p>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

// Sweden admission votes (server/utils/swedenAdmission.ts, hq 051): the Sweden managers
// start a vote on one applicant, the voters on Sweden's list vote with an optional note.

interface VoteSummary {
  id: string
  candidateName: string
  state: 'open' | 'due' | 'closed' | 'cancelled'
  closesAt: string
  closedAt: string | null
  onRoster: boolean
  hasVoted: boolean
  turnout: { voted: number; roster: number }
  result: { yes: number; no: number; blank: number; outcome: string } | null
}
interface Candidate {
  personId: string
  name: string
  joinRequestId: string
  since: string
  source: string | null
  whyJoin: string | null
  linkedin: string | null
  org: string | null
  roleTitle: string | null
  rejoin: boolean
  votable: boolean
  liveVote: { id: string; closesAt: string } | null
}
interface Person {
  personId: string
  name: string
  active: boolean
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const { visible, preview } = useSwedenAdmissionFlag()

const loading = ref(true)
const loadError = ref('')
const isManager = ref(false)
const votes = ref<VoteSummary[]>([])
const candidates = ref<Candidate[]>([])
const roles = ref<{ voters: Person[]; managers: Person[] } | null>(null)
const starting = ref<string | null>(null)
const saving = ref(false)
const actionError = ref('')
const startForm = ref({ note: '', days: 7 })
const activeVoters = computed(() => roles.value?.voters.filter((p) => p.active).length ?? '')

const dayItems = computed(() => [3, 7, 14].map((d) => ({ value: d, title: t('admission.start.days', d) })))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch<{
      isManager: boolean
      votes: VoteSummary[]
      candidates: Candidate[] | null
      roles: { voters: Person[]; managers: Person[] } | null
    }>('/api/member/sweden/admission')
    isManager.value = data.isManager
    votes.value = data.votes
    candidates.value = data.candidates ?? []
    roles.value = data.roles
  } catch (err: any) {
    if (err?.statusCode === 404) showError({ statusCode: 404, statusMessage: 'Not found' })
    loadError.value = t('swedenAdmission.errors.load')
  } finally {
    loading.value = false
  }
}

function openStart(joinRequestId: string) {
  starting.value = joinRequestId
  startForm.value = { note: '', days: 7 }
  actionError.value = ''
}

async function start(joinRequestId: string) {
  saving.value = true
  actionError.value = ''
  try {
    const res = await $fetch<{ id: string }>('/api/member/sweden/admission/votes', {
      method: 'POST',
      body: { joinRequestId, note: startForm.value.note, days: startForm.value.days },
    })
    await navigateTo(`/member/sweden/admission/${res.id}`)
  } catch (err: any) {
    actionError.value = err?.data?.message || t('swedenAdmission.errors.action')
  } finally {
    saving.value = false
  }
}

// Off, or not a voter or manager: the page does not exist for them (the server agrees).
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
.intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
  max-width: 640px;
}
.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 12px;
}
.muted {
  color: #888;
  font-size: 14px;
  max-width: 640px;
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}
.row-link {
  text-decoration: none;
  color: inherit;
}
.card {
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 14px 16px;
  transition: border-color 0.15s ease;
}
.row-link:hover .card {
  border-color: #555;
}
.name {
  font-weight: 600;
  color: #fff;
}
.meta {
  color: #999;
  font-size: 14px;
}
.why {
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.link {
  color: #90caf9;
  text-decoration: none;
  font-size: 14px;
}
.start-form {
  max-width: 560px;
}
.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  background: #2a2a2a;
  color: #ccc;
}
.tag-open,
.tag-todo {
  background: #ff9800;
  color: #111;
}
.tag-passed {
  background: #1e3a2a;
  color: #a5d6a7;
}
.tag-failed,
.tag-no_votes {
  background: #3a1e1e;
  color: #ef9a9a;
}
.tag-tie {
  background: #3a2a4a;
  color: #d1c4e9;
}
.tag-closed-status {
  background: #3a1e1e;
  color: #ef9a9a;
}
</style>
