<template>
  <div class="member-meeting text-left">
    <NuxtLink to="/member/arsmote" class="back-link mb-4 d-inline-block">← {{ t('meetings.back') }}</NuxtLink>

    <div v-if="loading" class="text-center py-6"><v-progress-circular indeterminate color="white" /></div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>

    <template v-else-if="data">
      <header class="mb-6">
        <div class="d-flex align-center flex-wrap mb-2" style="gap: 10px;">
          <h1 class="font-weight-bold mb-0" style="font-size: 1.6rem;">{{ m.title }}</h1>
          <span class="tag" :class="`tag-${m.status}`" data-test="meeting-status">{{ t(`meetings.status.${m.status}`) }}</span>
          <span v-if="m.kind === 'trial'" class="tag tag-trial">{{ t('meetings.kind.trial') }}</span>
        </div>
        <p class="mb-1" style="color: #aaa; font-size: 14px;">
          {{ t(`meetings.kind.${m.kind}`) }}<span v-if="m.heldAt"> · {{ formatDate(m.heldAt, 'long') }}</span><span v-if="m.place"> · {{ m.place }}</span>
        </p>
        <p v-if="m.chair || m.secretary" class="mb-0" style="color: #aaa; font-size: 14px;">
          <span v-if="m.chair">{{ t('meetings.chairIs', { name: m.chair.name }) }}</span>
          <span v-if="m.chair && m.secretary"> · </span>
          <span v-if="m.secretary">{{ t('meetings.secretaryIs', { name: m.secretary.name }) }}</span>
        </p>
        <p v-if="m.status === 'cancelled'" class="mt-2" style="color: #ffb74d;">{{ t('meetings.cancelled', { reason: m.cancelReason }) }}</p>
      </header>

      <v-alert v-if="actionError" type="warning" variant="outlined" class="text-left mb-4" closable @click:close="actionError = ''">
        {{ actionError }}
      </v-alert>

      <!-- Me: am I on the roster, am I here -->
      <section v-if="m.status !== 'draft'" class="mb-6">
        <div class="me-card">
          <template v-if="data.me.onRoster">
            <p class="mb-2" style="color: #fff;">
              {{ data.me.eligible ? t('meetings.me.onRoster') : t('meetings.me.noVote', { reason: data.me.ineligibleReason }) }}
            </p>
            <template v-if="m.status === 'in_session'">
              <p v-if="data.me.present" class="mb-2" style="color: #a5d6a7;" data-test="me-present">{{ t('meetings.me.present') }}</p>
              <p v-else class="mb-2" style="color: #ccc;">{{ t('meetings.me.notPresent') }}</p>
              <v-btn
                v-if="!data.me.present"
                style="background-color: white; color: #111;"
                :loading="busy === 'attend'"
                data-test="check-in"
                @click="act('attend', `/attendance`, { present: true })"
              >
                {{ t('meetings.me.checkIn') }}
              </v-btn>
              <v-btn v-else variant="text" :loading="busy === 'attend'" @click="act('attend', `/attendance`, { present: false })">
                {{ t('meetings.me.checkOut') }}
              </v-btn>
            </template>
            <p v-else-if="m.status === 'announced'" class="mb-0" style="color: #aaa; font-size: 14px;">{{ t('meetings.me.beforeSession') }}</p>
          </template>
          <p v-else class="mb-0" style="color: #aaa;">{{ t('meetings.me.notOnRoster') }}</p>
          <p v-if="data.attendance && m.status !== 'announced'" class="mt-3 mb-0" style="color: #999; font-size: 14px;">
            {{ t('meetings.attendanceCount', { n: data.attendance.count, of: m.rosterCount }) }}
          </p>
        </div>
      </section>

      <!-- The board: set up the meeting before the session -->
      <section v-if="data.me.isBoard && (m.status === 'draft' || m.status === 'announced')" class="mb-8 board-panel">
        <div class="d-flex align-center mb-3" style="gap: 12px;">
          <h2 class="section-title mb-0">{{ t('meetings.setup.title') }}</h2>
          <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold">{{ t('common.board') }}</v-chip>
        </div>

        <div class="step">
          <p class="step-title">{{ t('meetings.setup.roster') }}</p>
          <p v-if="m.rosterFrozenAt" class="mb-2" style="color: #ccc; font-size: 14px;" data-test="roster-frozen">
            {{ t('meetings.setup.rosterFrozen', { n: m.rosterCount, date: formatDate(m.rosterFrozenAt, 'long') }) }}
          </p>
          <p v-else class="mb-2" style="color: #aaa; font-size: 14px;">{{ t(`meetings.setup.rosterHint.${m.kind === 'trial' ? 'trial' : 'real'}`) }}</p>
          <v-btn variant="outlined" :loading="busy === 'roster'" data-test="freeze-roster" @click="act('roster', '/roster')">
            {{ m.rosterFrozenAt ? t('meetings.setup.refreeze') : t('meetings.setup.freeze') }}
          </v-btn>
        </div>

        <div class="step">
          <p class="step-title">{{ t('meetings.setup.countBase') }}</p>
          <v-radio-group v-model="countBase" hide-details density="compact" @update:model-value="saveCountBase">
            <v-radio value="yes+no" :label="t('meetings.countBase.yesNo')" />
            <v-radio value="yes+no+blank" :label="t('meetings.countBase.withBlank')" />
          </v-radio-group>
        </div>

        <div class="step">
          <p class="step-title">{{ t('meetings.setup.addItem') }}</p>
          <v-text-field v-model="itemForm.title" :label="t('meetings.fields.itemTitle')" variant="outlined" density="comfortable" hide-details="auto" class="mb-3" data-test="item-title" />
          <v-textarea v-model="itemForm.body" :label="t('meetings.fields.itemBody')" rows="2" variant="outlined" density="comfortable" hide-details="auto" class="mb-3" />
          <v-select v-model="itemForm.preset" :items="presetItems" :label="t('meetings.fields.preset')" variant="outlined" density="comfortable" hide-details="auto" class="mb-3" data-test="item-preset" />
          <v-select v-model="itemForm.ballot" :items="ballotItems" :label="t('meetings.fields.ballot')" variant="outlined" density="comfortable" hide-details="auto" class="mb-3" data-test="item-ballot" />
          <v-btn variant="outlined" :disabled="!itemForm.title.trim()" :loading="busy === 'item'" data-test="item-add" @click="addItem">
            {{ t('meetings.setup.addItemButton') }}
          </v-btn>
        </div>

        <div class="d-flex flex-wrap" style="gap: 12px;">
          <v-btn
            v-if="m.status === 'draft'"
            style="background-color: white; color: #111;"
            :disabled="!m.rosterFrozenAt || !activeItems.length"
            :loading="busy === 'announce'"
            data-test="announce"
            @click="act('announce', '/announce')"
          >
            {{ t('meetings.setup.announce') }}
          </v-btn>
          <v-btn
            v-if="m.status === 'announced'"
            style="background-color: white; color: #111;"
            :loading="busy === 'session'"
            data-test="open-session"
            @click="act('session', '/session', { action: 'open' })"
          >
            {{ t('meetings.setup.openSession') }}
          </v-btn>
        </div>
      </section>

      <!-- Chair and referent: the board sets them (the meeting elects the chair, § 5.3) -->
      <section v-if="data.me.isBoard && data.roster && m.status !== 'closed' && m.status !== 'cancelled'" class="mb-8 board-panel">
        <p class="step-title">{{ t('meetings.setup.roles') }}</p>
        <div class="d-flex flex-wrap" style="gap: 12px;">
          <v-select v-model="chairId" :items="personItems" :label="t('meetings.fields.chair')" variant="outlined" density="comfortable" hide-details clearable style="min-width: 240px;" data-test="chair" />
          <v-select v-model="secretaryId" :items="personItems" :label="t('meetings.fields.secretary')" variant="outlined" density="comfortable" hide-details clearable style="min-width: 240px;" />
          <v-btn variant="outlined" :loading="busy === 'roles'" data-test="save-roles" @click="saveRoles">{{ t('common.save') }}</v-btn>
        </div>
      </section>

      <!-- The saker -->
      <section class="mb-8">
        <h2 class="section-title">{{ t('meetings.items') }}</h2>
        <p v-if="!data.items.length" style="color: #888;">{{ t('meetings.noItems') }}</p>
        <div class="feed">
          <div v-for="it in data.items" :key="it.id" class="item-card" :class="{ 'item-open': it.status === 'open' }" :data-test="`item-${it.position}`">
            <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
              <span class="item-title">{{ t('meetings.itemHeading', { n: it.position, title: it.title }) }}</span>
              <span class="tag" :class="`tag-item-${it.status}`">{{ t(`meetings.itemStatus.${it.status}`) }}</span>
            </div>
            <p class="meta mb-2">
              {{ t(`meetings.preset.${it.preset}`) }} · {{ t(`meetings.ballot.${it.ballot}`) }}
            </p>
            <p v-if="it.body" class="mb-3" style="color: #ccc; white-space: pre-line;">{{ it.body }}</p>
            <p v-if="it.status === 'withdrawn'" style="color: #999;">{{ t('meetings.withdrawn', { reason: it.withdrawReason }) }}</p>

            <!-- Voting, live -->
            <template v-if="it.status === 'open'">
              <p v-if="it.progress" class="mb-2" style="color: #ccc;" data-test="progress">
                {{ t('meetings.progress', { voted: it.progress.voted, present: it.progress.present }) }}
              </p>
              <div v-if="canVote">
                <p v-if="it.myVote?.voted && it.ballot === 'secret'" class="mb-2" style="color: #a5d6a7;" data-test="voted-secret">
                  {{ t('meetings.vote.votedSecret') }}
                </p>
                <template v-else>
                  <p v-if="it.myVote?.voted" class="mb-2" style="color: #a5d6a7;" data-test="voted-open">
                    {{ t('meetings.vote.votedOpen', { choice: t(`meetings.choice.${it.myVote.choice}`) }) }}
                  </p>
                  <p v-if="it.ballot === 'secret'" class="mb-2" style="color: #aaa; font-size: 13px;">{{ t('meetings.vote.secretOnce') }}</p>
                  <div class="d-flex flex-wrap" style="gap: 10px;">
                    <v-btn
                      v-for="c in (['yes', 'no', 'blank'] as const)"
                      :key="c"
                      :variant="it.myVote?.choice === c ? 'flat' : 'outlined'"
                      :loading="busy === `vote-${it.id}-${c}`"
                      :disabled="Boolean(busy)"
                      :data-test="`vote-${c}`"
                      @click="act(`vote-${it.id}-${c}`, `/items/${it.id}/ballot`, { choice: c })"
                    >
                      {{ t(`meetings.choice.${c}`) }}
                    </v-btn>
                  </div>
                </template>
              </div>
              <p v-else-if="data.me.onRoster && data.me.eligible && !data.me.present" style="color: #ffb74d;">{{ t('meetings.vote.checkInFirst') }}</p>
            </template>

            <!-- Counted -->
            <template v-if="it.status === 'closed' && it.counts">
              <p class="result mb-1" :class="`result-${it.finalOutcome}`" data-test="result">{{ t(`meetings.outcome.${it.finalOutcome}`) }}</p>
              <p class="mb-2" style="color: #ccc;">
                {{ t('meetings.countLine', { yes: it.counts.yes, no: it.counts.no, blank: it.counts.blank, present: it.counts.present }) }}
              </p>
              <p v-if="it.lot" class="mb-2" style="color: #ccc;">{{ t('meetings.lotLine', { outcome: t(`meetings.outcome.${it.lot.outcome}`), note: it.lot.note, by: it.lot.by }) }}</p>
              <details v-if="it.named?.length" class="mb-2">
                <summary style="color: #aaa; cursor: pointer;">{{ t('meetings.namedVotes', it.named.length) }}</summary>
                <p class="mt-2" style="color: #ccc; font-size: 14px;">
                  {{ it.named.map((x) => `${x.name} (${t(`meetings.choice.${x.choice}`)})`).join(', ') }}
                </p>
              </details>
              <details v-if="it.voters?.length" class="mb-2">
                <summary style="color: #aaa; cursor: pointer;">{{ t('meetings.secretVoters', it.voters.length) }}</summary>
                <p class="mt-2" style="color: #ccc; font-size: 14px;">{{ it.voters.join(', ') }}</p>
              </details>
              <details class="mb-1">
                <summary style="color: #aaa; cursor: pointer;">{{ t('meetings.forMinutes') }}</summary>
                <pre class="protocol" data-test="protocol-text">{{ it.protocolText }}</pre>
                <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="copy(it.protocolText)">{{ t('meetings.copy') }}</v-btn>
              </details>
            </template>

            <!-- The chair -->
            <div v-if="data.me.canRun" class="chair-row mt-3">
              <v-btn v-if="it.status === 'pending'" variant="outlined" :disabled="hasOpenItem" :loading="busy === `open-${it.id}`" :data-test="`open-item-${it.position}`" @click="act(`open-${it.id}`, `/items/${it.id}/open`)">
                {{ t('meetings.chair.openItem') }}
              </v-btn>
              <v-btn v-if="it.status === 'open'" style="background-color: white; color: #111;" :loading="busy === `close-${it.id}`" :data-test="`close-item-${it.position}`" @click="act(`close-${it.id}`, `/items/${it.id}/close`)">
                {{ t('meetings.chair.closeItem') }}
              </v-btn>
              <div v-if="it.status === 'closed' && it.result === 'tie' && !it.lot" class="lot-form" data-test="lot-form">
                <p class="mb-2" style="color: #ffb74d;">{{ t('meetings.chair.lotIntro') }}</p>
                <v-radio-group v-model="lotForm.outcome" inline hide-details density="compact">
                  <v-radio value="passed" :label="t('meetings.outcome.passed')" data-test="lot-passed" />
                  <v-radio value="failed" :label="t('meetings.outcome.failed')" />
                </v-radio-group>
                <v-text-field v-model="lotForm.note" :label="t('meetings.chair.lotNote')" variant="outlined" density="comfortable" hide-details class="my-2" data-test="lot-note" />
                <v-btn variant="outlined" :disabled="!lotForm.outcome || !lotForm.note.trim()" :loading="busy === `lot-${it.id}`" data-test="lot-save" @click="act(`lot-${it.id}`, `/items/${it.id}/lot`, { outcome: lotForm.outcome, note: lotForm.note })">
                  {{ t('meetings.chair.lotSave') }}
                </v-btn>
              </div>
            </div>
          </div>
        </div>
        <p v-if="hasProtocol" class="mt-4">
          <a :href="`/api/member/meetings/${m.id}/protocol`" target="_blank" rel="noopener" class="inline-link" data-test="protocol-pdf">{{ t('meetings.protocolPdf') }}</a>
        </p>
      </section>

      <!-- The chair: attendance on behalf, close the session -->
      <section v-if="data.me.canRun && data.roster" class="mb-8 board-panel">
        <p class="step-title">{{ t('meetings.chair.attendance') }}</p>
        <p class="mb-2" style="color: #aaa; font-size: 13px;">{{ t('meetings.chair.attendanceHint') }}</p>
        <v-text-field v-model="search" :label="t('meetings.chair.search')" variant="outlined" density="compact" hide-details class="mb-2" style="max-width: 320px;" />
        <div class="roster">
          <div v-for="p in filteredRoster" :key="p.personId" class="roster-row">
            <span :style="{ color: p.present ? '#a5d6a7' : '#ccc' }">{{ p.name }}<span v-if="!p.eligible" style="color: #888;"> ({{ t('meetings.chair.noVote') }})</span></span>
            <v-btn size="small" variant="text" :loading="busy === `att-${p.personId}`" @click="act(`att-${p.personId}`, `/attendance/${p.personId}`, { present: !p.present, reason: t('meetings.chair.onBehalfReason') })">
              {{ p.present ? t('meetings.chair.markAway') : t('meetings.chair.markPresent') }}
            </v-btn>
          </div>
        </div>
        <v-btn v-if="data.me.isBoard" class="mt-4" variant="outlined" :disabled="hasOpenItem" :loading="busy === 'session'" data-test="close-session" @click="act('session', '/session', { action: 'close' })">
          {{ t('meetings.chair.closeSession') }}
        </v-btn>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

type Choice = 'yes' | 'no' | 'blank'
interface Item {
  id: string
  position: number
  title: string
  body: string | null
  preset: string
  ballot: 'open' | 'secret'
  status: 'pending' | 'open' | 'closed' | 'withdrawn'
  withdrawReason: string | null
  result: string | null
  finalOutcome: string | null
  lot: { outcome: string; note: string; by: string; at: string } | null
  myVote: { voted: boolean; choice: Choice | null } | null
  progress: { voted: number; present: number } | null
  counts: { yes: number; no: number; blank: number; present: number } | null
  named: { name: string; choice: Choice }[] | null
  voters: string[] | null
  protocolText: string | null
}
interface MeetingData {
  meeting: any
  me: {
    isBoard: boolean
    isChair: boolean
    canRun: boolean
    onRoster: boolean
    eligible: boolean
    ineligibleReason: string | null
    present: boolean
  }
  attendance: { count: number; names: string[] } | null
  roster: { personId: string; name: string; eligible: boolean; present: boolean }[] | null
  items: Item[]
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const route = useRoute()
const id = computed(() => String(route.params.id))

const data = ref<MeetingData | null>(null)
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const busy = ref('')
const countBase = ref('yes+no')
const chairId = ref<string | null>(null)
const secretaryId = ref<string | null>(null)
const search = ref('')
const itemForm = ref({ title: '', body: '', preset: 'majority', ballot: 'open' })
const lotForm = ref({ outcome: '' as '' | 'passed' | 'failed', note: '' })

const m = computed(() => data.value?.meeting ?? {})
const activeItems = computed(() => (data.value?.items ?? []).filter((i) => i.status !== 'withdrawn'))
const hasOpenItem = computed(() => (data.value?.items ?? []).some((i) => i.status === 'open'))
const hasProtocol = computed(() => (data.value?.items ?? []).some((i) => i.status === 'closed'))
const canVote = computed(() => Boolean(data.value?.me.onRoster && data.value.me.eligible && data.value.me.present))
const presetItems = computed(() =>
  ['majority', 'two_thirds', 'three_quarters', 'three_quarters_present'].map((p) => ({
    value: p,
    title: t(`meetings.preset.${p}`),
  })),
)
const ballotItems = computed(() => ['open', 'secret'].map((b) => ({ value: b, title: t(`meetings.ballot.${b}`) })))
const personItems = computed(() => (data.value?.roster ?? []).map((p) => ({ value: p.personId, title: p.name })))
const filteredRoster = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value?.roster ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
})

function apply(view: MeetingData) {
  data.value = view
  countBase.value = view.meeting.countBase
  chairId.value = view.meeting.chair?.id ?? null
  secretaryId.value = view.meeting.secretary?.id ?? null
}

async function load() {
  loading.value = !data.value
  loadError.value = ''
  try {
    apply(await $fetch<MeetingData>(`/api/member/meetings/${id.value}`))
  } catch (err: any) {
    loadError.value = err?.statusCode === 404 ? t('meetings.errors.notFound') : t('meetings.errors.load')
  } finally {
    loading.value = false
  }
}

async function act(key: string, path: string, body: Record<string, unknown> = {}, method: 'POST' | 'PATCH' = 'POST') {
  busy.value = key
  actionError.value = ''
  try {
    const res = await $fetch<any>(`/api/member/meetings/${id.value}${path}`, { method, body })
    if (res?.meeting) apply(res)
    else await load()
    if (key.startsWith('lot-')) lotForm.value = { outcome: '', note: '' }
  } catch (err: any) {
    actionError.value = err?.data?.message || t('meetings.errors.action')
    await load()
  } finally {
    busy.value = ''
  }
}

const saveCountBase = (value: string | null) => act('countBase', '', { countBase: value }, 'PATCH')
const saveRoles = () => act('roles', '', { chair: chairId.value, secretary: secretaryId.value }, 'PATCH')

async function addItem() {
  await act('item', '/items', {
    title: itemForm.value.title,
    body: itemForm.value.body || null,
    preset: itemForm.value.preset,
    ballot: itemForm.value.ballot,
  })
  if (!actionError.value) itemForm.value = { title: '', body: '', preset: 'majority', ballot: 'open' }
}

async function copy(text: string | null) {
  if (text) await navigator.clipboard?.writeText(text)
}

// A live meeting: refresh every 5 s while it is in session, so the chair sees
// the progress and members see a sak open without reloading.
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    if (data.value?.meeting.status === 'in_session' && !busy.value) load()
  }, 5000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})
</script>

<style scoped>
.back-link {
  color: #aaa;
  text-decoration: none;
  font-size: 14px;
}
.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 12px;
}
.me-card,
.board-panel {
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 16px 18px;
  max-width: 760px;
}
.step {
  margin-bottom: 18px;
}
.step-title {
  font-weight: 600;
  color: #fff;
  margin-bottom: 6px;
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}
.item-card {
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 14px 16px;
}
.item-open {
  border-color: #ff9800;
}
.item-title {
  font-weight: 600;
  color: #fff;
}
.meta {
  color: #999;
  font-size: 14px;
}
.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  background: #2a2a2a;
  color: #ccc;
}
.tag-in_session,
.tag-item-open {
  background: #ff9800;
  color: #111;
}
.tag-announced {
  background: #1e3a2a;
  color: #a5d6a7;
}
.tag-trial {
  background: #3a2a4a;
  color: #d1c4e9;
}
.result {
  font-weight: 700;
  font-size: 1.05rem;
}
.result-passed {
  color: #a5d6a7;
}
.result-failed,
.result-no_votes {
  color: #ef9a9a;
}
.result-tie {
  color: #ffb74d;
}
.protocol {
  white-space: pre-wrap;
  font-size: 13px;
  color: #ddd;
  background: #111;
  border: 1px solid #2a2a2a;
  padding: 10px;
  margin-top: 8px;
}
.roster {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
}
.roster-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  border-bottom: 1px solid #1f1f1f;
}
.inline-link {
  color: #fff;
}
</style>
