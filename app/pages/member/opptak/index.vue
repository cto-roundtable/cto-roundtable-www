<template>
  <div class="admission text-left">
    <v-alert v-if="preview" type="warning" variant="tonal" class="mb-6 text-left" style="max-width: 760px;" data-test="admission-preview">
      <strong>{{ t('admission.preview.label') }}.</strong> {{ t('admission.preview.hint') }}
    </v-alert>
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('admission.title') }}</h1>
      <p class="intro">{{ t('admission.intro') }}</p>
    </header>

    <div v-if="loading" class="text-center py-6"><v-progress-circular indeterminate color="white" /></div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>
    <template v-else>
      <!-- Votes: every roster member's, and the board's -->
      <section class="mb-8" data-test="admission-votes">
        <h2 class="section-title">{{ t('admission.votes.title') }}</h2>
        <p v-if="votes.length === 0" class="muted">{{ t('admission.votes.none') }}</p>
        <div v-else class="feed">
          <NuxtLink v-for="v in votes" :key="v.id" :to="`/member/opptak/${v.id}`" class="row-link" data-test="admission-vote-row">
            <div class="card">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="name">{{ v.candidateName }}</span>
                <span class="tag" :class="`tag-${v.state}`">{{ t(`admission.state.${v.state}`) }}</span>
                <span v-if="v.state === 'closed' && v.result" class="tag" :class="`tag-${finalOf(v)}`">
                  {{ t(`admission.outcome.${finalOf(v)}`) }}
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

      <template v-if="isBoard">
        <!-- Admission status per group -->
        <section class="mb-8" data-test="admission-groups">
          <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
            <h2 class="section-title mb-0">{{ t('admission.groups.title') }}</h2>
            <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
              {{ t('common.board') }}
            </v-chip>
          </div>
          <p class="muted mb-3">{{ t('admission.groups.hint') }}</p>
          <div class="feed">
            <div v-for="g in groups" :key="g.slug" class="card d-flex align-center flex-wrap" style="gap: 12px;" :data-test="`admission-group-${g.slug}`">
              <div style="flex: 1; min-width: 200px;">
                <div class="d-flex align-center" style="gap: 8px;">
                  <span class="name">{{ g.name }}</span>
                  <span class="tag" :class="g.status === 'open' ? 'tag-passed' : 'tag-closed-status'">{{ t(`admission.groups.${g.status}`) }}</span>
                </div>
                <p v-if="g.changedAt" class="meta mb-0">{{ t('admission.groups.changed', { date: formatDate(g.changedAt, 'short'), name: g.changedBy || '?' }) }}</p>
              </div>
              <v-btn
                variant="outlined"
                size="small"
                :loading="savingGroup === g.slug"
                :disabled="preview && g.status === 'closed'"
                :data-test="`admission-toggle-${g.slug}`"
                @click="toggleGroup(g)"
              >
                {{ g.status === 'open' ? t('admission.groups.close') : t('admission.groups.open') }}
              </v-btn>
            </div>
          </div>
        </section>

        <!-- The list: prospects and pending applications -->
        <section class="mb-8" data-test="admission-candidates">
          <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
            <h2 class="section-title mb-0">{{ t('admission.candidates.title') }}</h2>
            <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
              {{ t('common.board') }}
            </v-chip>
          </div>
          <p class="muted mb-3">{{ t('admission.candidates.hint') }}</p>
          <p v-if="candidates.length === 0" class="muted">{{ t('admission.candidates.none') }}</p>
          <div v-else class="feed">
            <div v-for="c in candidates" :key="c.personId" class="card" data-test="admission-candidate">
              <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
                <span class="name">{{ c.name }}</span>
                <span v-if="c.group === 'roundtable-sweden'" class="tag">{{ t('admission.candidates.sweden') }}</span>
                <span v-if="c.kind === 'rejoin'" class="tag">{{ t('admission.candidates.rejoin') }}</span>
                <span v-if="c.kind === 'accepted'" class="tag tag-passed">{{ t('admission.candidates.accepted') }}</span>
                <span class="tag">{{ c.joinRequestId ? t(`admission.candidates.source.${c.source === 'form' ? 'form' : 'manual'}`) : t('admission.candidates.source.prospect') }}</span>
              </div>
              <p class="meta mb-1">
                <template v-if="c.roleTitle || c.org">{{ [c.roleTitle, c.org].filter(Boolean).join(', ') }} · </template>
                {{ t('admission.candidates.since', { date: formatDate(c.since, 'short') }) }}
                <template v-if="c.invitedBy"> · {{ t('admission.candidates.invitedBy', { name: c.invitedBy }) }}</template>
                <template v-if="c.linkedin"> · <a :href="c.linkedin" target="_blank" rel="noopener" class="link">LinkedIn</a></template>
              </p>
              <p v-if="c.whyJoin" class="why mb-2">{{ c.whyJoin }}</p>

              <NuxtLink v-if="c.liveVote" :to="`/member/opptak/${c.liveVote.id}`" class="link">
                {{ t('admission.candidates.running', { date: formatDate(c.liveVote.closesAt, 'long') }) }}
              </NuxtLink>
              <template v-else-if="c.votable">
                <v-btn
                  v-if="starting !== c.personId"
                  variant="outlined"
                  size="small"
                  prepend-icon="mdi-vote-outline"
                  :disabled="preview"
                  data-test="admission-start"
                  @click="openStart(c.personId)"
                >
                  {{ t('admission.start.button') }}
                </v-btn>
                <div v-else class="start-form mt-2">
                  <v-textarea
                    v-model="startForm.note"
                    :label="t('admission.start.note')"
                    :hint="t('admission.start.noteHint')"
                    persistent-hint
                    variant="outlined"
                    density="comfortable"
                    rows="3"
                    auto-grow
                    class="mb-3"
                    data-test="admission-note"
                  />
                  <v-select
                    v-model="startForm.days"
                    :items="dayItems"
                    :label="t('admission.start.window')"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    class="mb-3"
                    style="max-width: 240px;"
                  />
                  <p class="muted mb-3" style="font-size: 13px;">{{ t('admission.start.rule', { n: rosterHint }) }}</p>
                  <div class="d-flex flex-wrap" style="gap: 12px;">
                    <v-btn :loading="saving" style="background-color: white; color: #111;" data-test="admission-start-confirm" @click="start(c.personId)">
                      {{ t('admission.start.confirm') }}
                    </v-btn>
                    <v-btn variant="text" :disabled="saving" @click="starting = null">{{ t('common.cancel') }}</v-btn>
                  </div>
                </div>
              </template>
              <p v-else class="meta mb-0">
                {{ t(`admission.candidates.${c.kind === 'rejoin' ? 'rejoinHint' : c.kind === 'accepted' ? 'acceptedHint' : 'swedenHint'}`) }}
              </p>
            </div>
          </div>
          <v-alert v-if="actionError" type="warning" variant="outlined" class="mt-3 text-left">{{ actionError }}</v-alert>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface VoteSummary {
  id: string
  candidateName: string
  state: 'open' | 'due' | 'closed' | 'cancelled'
  closesAt: string
  closedAt: string | null
  onRoster: boolean
  hasVoted: boolean
  turnout: { voted: number; roster: number }
  result: { yes: number; no: number; blank: number; outcome: string; lot: { outcome: string } | null } | null
}
interface Group {
  slug: string
  name: string
  status: 'open' | 'closed'
  changedAt: string | null
  changedBy: string | null
}
interface Candidate {
  personId: string
  name: string
  since: string
  joinRequestId: string | null
  source: string | null
  group: string
  whyJoin: string | null
  invitedBy: string | null
  linkedin: string | null
  org: string | null
  roleTitle: string | null
  kind: 'prospect' | 'rejoin' | 'accepted'
  votable: boolean
  liveVote: { id: string; closesAt: string } | null
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const { visible, preview } = useAdmissionsFlag()

const loading = ref(true)
const loadError = ref('')
const isBoard = ref(false)
const votes = ref<VoteSummary[]>([])
const groups = ref<Group[]>([])
const candidates = ref<Candidate[]>([])
const starting = ref<string | null>(null)
const saving = ref(false)
const savingGroup = ref<string | null>(null)
const actionError = ref('')
const startForm = ref({ note: '', days: 7 })
const rosterHint = computed(() => votes.value[0]?.turnout.roster ?? '')

const dayItems = computed(() => [3, 7, 14].map((d) => ({ value: d, title: t('admission.start.days', d) })))

const finalOf = (v: VoteSummary) =>
  v.result?.outcome === 'tie' && v.result.lot ? v.result.lot.outcome : v.result?.outcome

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch<{
      isBoard: boolean
      votes: VoteSummary[]
      groups: Group[] | null
      candidates: Candidate[] | null
    }>('/api/member/admission')
    isBoard.value = data.isBoard
    votes.value = data.votes
    groups.value = data.groups ?? []
    candidates.value = data.candidates ?? []
  } catch {
    loadError.value = t('admission.errors.load')
  } finally {
    loading.value = false
  }
}

function openStart(personId: string) {
  starting.value = personId
  startForm.value = { note: '', days: 7 }
  actionError.value = ''
}

async function start(personId: string) {
  saving.value = true
  actionError.value = ''
  try {
    const res = await $fetch<{ id: string }>('/api/member/admission/votes', {
      method: 'POST',
      body: { personId, note: startForm.value.note, days: startForm.value.days },
    })
    await navigateTo(`/member/opptak/${res.id}`)
  } catch (err: any) {
    actionError.value = err?.data?.message || t('admission.errors.action')
  } finally {
    saving.value = false
  }
}

async function toggleGroup(g: Group) {
  savingGroup.value = g.slug
  actionError.value = ''
  try {
    const res = await $fetch<{ groups: Group[] }>('/api/member/admission/groups', {
      method: 'POST',
      body: { slug: g.slug, status: g.status === 'open' ? 'closed' : 'open' },
    })
    groups.value = res.groups
  } catch (err: any) {
    actionError.value = err?.data?.message || t('admission.errors.action')
  } finally {
    savingGroup.value = null
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
