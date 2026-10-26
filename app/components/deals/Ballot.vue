<template>
  <div class="round">
    <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px;">
      <span class="round-title">{{ round.group.name }}</span>
      <span v-if="round.status === 'draft'" class="tag tag-muted">{{ t('deals.round.status.draft') }}</span>
      <span v-else-if="round.status === 'open'" class="tag tag-open">{{ t('deals.round.status.open') }}</span>
      <span v-else-if="round.status === 'closed' && round.result" class="tag" :class="round.result === 'passed' ? 'tag-ok' : 'tag-muted'">
        {{ t(`deals.round.result.${round.result}`) }}
      </span>
      <span v-else class="tag tag-muted">{{ t(`deals.round.status.${round.status}`) }}</span>
    </div>

    <p v-if="proposalLine" class="line">{{ proposalLine }}</p>

    <!-- Email-era history: counts only. -->
    <p v-if="round.source === 'backfill'" class="meta">
      {{ t('deals.ballot.backfill', { date: round.closedAt ? formatDate(round.closedAt, 'short') : '' }) }}
    </p>

    <template v-if="round.status === 'draft'">
      <p class="meta">{{ t('deals.ballot.draftNote') }}</p>
      <template v-if="round.canOpen">
        <v-btn class="mt-2" style="background-color: white; color: #111;" @click="confirmOpen = true">
          {{ t('deals.ballot.open') }}
        </v-btn>
        <v-dialog v-model="confirmOpen" max-width="440">
          <v-card theme="dark" class="pa-5">
            <p class="mb-4" style="font-size: 15px; line-height: 1.5;">{{ t('deals.ballot.openConfirm', { group: round.group.name }) }}</p>
            <div class="d-flex justify-end" style="gap: 8px;">
              <v-btn variant="text" @click="confirmOpen = false">{{ t('common.cancel') }}</v-btn>
              <v-btn :loading="busy" style="background-color: white; color: #111;" @click="open">{{ t('deals.ballot.openYes') }}</v-btn>
            </div>
          </v-card>
        </v-dialog>
      </template>
    </template>

    <template v-if="round.status === 'open'">
      <p class="line">
        {{ t('deals.ballot.deadline', { when: stamp(round.closesAt!) }) }}
        <span class="meta"> · {{ timeLeft }}</span>
      </p>

      <div v-if="round.me.onRoster" class="vote mt-3">
        <p v-if="round.me.ballot" class="mine">
          {{ t('deals.ballot.youVoted', { choice: t(`deals.ballot.choice.${round.me.ballot.choice}`), when: stamp(round.me.ballot.castAt) }) }}
        </p>
        <p v-else-if="round.me.defaultVote === 'blank'" class="mine">{{ t('deals.ballot.standingBlank') }}</p>
        <p v-else class="mine">{{ t('deals.ballot.notVotedYet') }}</p>
        <p v-if="round.me.conflict" class="meta">{{ t('deals.ballot.conflict') }}</p>
        <div class="choices mt-2">
          <button
            v-for="c in choices"
            :key="c"
            type="button"
            class="choice"
            :class="{ chosen: round.me.ballot?.choice === c }"
            :disabled="busy || (round.me.conflict && c !== 'blank')"
            @click="vote(c)"
          >
            {{ t(`deals.ballot.choice.${c}`) }}
          </button>
        </div>
        <p class="meta mt-2">{{ t('deals.ballot.changeUntil') }}</p>
      </div>
      <p v-else class="meta mt-2">{{ t('deals.ballot.notOnRoster', { group: round.group.name }) }}</p>

      <!-- Committee, once the 48 hours are up: close it (the deal-rounds job does the same).
           A passed CTORI4 vote needs the hovedbok's lead and follow-up owner first (dc-39). -->
      <div v-if="round.close?.due" class="close-box mt-4">
        <p class="line mb-1">{{ t('deals.ballot.closeDue') }}</p>
        <template v-if="round.close.missing.length">
          <p class="meta mb-3">{{ t('deals.ballot.closeNeeds') }}</p>
          <v-select
            v-if="round.close.missing.includes('lead')"
            v-model="lead"
            :items="candidates"
            item-title="name"
            item-value="id"
            :label="t('deals.ballot.closeLead')"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-3"
          />
          <v-select
            v-if="round.close.missing.includes('follow_up_owner')"
            v-model="owner"
            :items="candidates"
            item-title="name"
            item-value="id"
            :label="t('deals.ballot.closeOwner')"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-3"
          />
        </template>
        <p v-else-if="round.close.hovedbok" class="meta mb-3">{{ t('deals.ballot.closeHovedbok') }}</p>
        <v-btn :loading="busy" :disabled="!closeReady" style="background-color: white; color: #111;" @click="close">
          {{ t('deals.ballot.close') }}
        </v-btn>
      </div>
    </template>

    <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3">{{ error }}</v-alert>

    <template v-if="round.tally && round.status !== 'draft'">
      <div class="bar mt-4" role="img" :aria-label="countsLine">
        <span v-for="s in segments" :key="s.key" :class="`seg seg-${s.key}`" :style="{ width: `${s.pct}%` }" />
      </div>
      <p class="counts mt-2">{{ countsLine }}</p>
      <p v-if="round.source !== 'backfill'" class="meta">
        {{ t('deals.ballot.turnout', { pct: pct(round.tally.turnout), n: round.tally.eligible }) }}
      </p>
      <p v-if="round.status === 'open'" class="meta mt-1">{{ t('deals.ballot.secret') }}</p>
    </template>

    <a
      v-if="round.status === 'closed' && round.hasProtocol"
      :href="`/api/member/deals/${slug}/rounds/${round.id}/protocol`"
      target="_blank"
      rel="noopener"
      class="protocol mt-3"
    >
      <v-icon size="16" class="mr-2">mdi-file-pdf-box</v-icon>{{ t('deals.ballot.protocol') }}
    </a>

    <!-- Committee and board only: who voted what (decision 2026-10-22 §3). -->
    <div v-if="round.named && round.named.length" class="named mt-4">
      <p class="named-label mb-2">{{ t('deals.ballot.namedLabel') }}</p>
      <div v-for="(row, i) in round.named" :key="i" class="named-row">
        <span class="named-name">{{ row.name }}</span>
        <span class="named-choice" :class="`c-${row.counted}`">{{ t(`deals.ballot.counted.${row.counted}`) }}</span>
        <span class="named-meta">
          {{ row.castAt ? `${t(`deals.ballot.method.${row.method}`)}, ${stamp(row.castAt)}` : '' }}{{ row.late ? ` · ${t('deals.ballot.late')}` : '' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// One decision round on a case. Members see the counts live and their own ballot;
// the committee also sees the named list. A ballot is one tap, and "no" weighs the
// same as "yes". Rules and visibility: server/utils/dealRounds.ts.
interface Tally {
  eligible: number
  yes: number
  no: number
  blank: number
  defaultBlank: number
  notVoted: number
  late: number
  turnout: number
}
interface CaseRoundView {
  id: string
  group: { slug: string; name: string }
  status: string
  source: string
  openedAt: string | null
  closesAt: string | null
  closedAt: string | null
  result: string | null
  proposal: { amount?: number; currency?: string; instrument?: string; cap?: number | null } | null
  bundleSha256: string | null
  tally: Tally | null
  hasProtocol: boolean
  me: {
    onRoster: boolean
    defaultVote: string | null
    conflict: boolean
    ballot: { choice: string; castAt: string } | null
  }
  named?: { name: string; counted: string; method: string | null; castAt: string | null; late: boolean }[]
  canOpen?: boolean
  close?: { due: boolean; hovedbok: boolean; missing: ('lead' | 'follow_up_owner')[] }
}

const props = defineProps<{ slug: string; round: CaseRoundView }>()
const emit = defineEmits<{ changed: [] }>()

const { t, n } = useI18n()
const { formatDate, format } = useLocaleDate()
const { $posthog } = useNuxtApp()

const choices = ['yes', 'no', 'blank'] as const
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)
const lead = ref<string | null>(null)
const owner = ref<string | null>(null)
const candidates = ref<{ id: string; name: string }[]>([])

// Ticks so "time left" stays right on a page left open.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

const stamp = (v: string) =>
  format(v, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const pct = (x: number) => n(x, { style: 'percent', maximumFractionDigits: 0 })

const proposalLine = computed(() => {
  const p = props.round.proposal
  if (!p?.amount) return ''
  const amount = `${n(p.amount, { maximumFractionDigits: 0 })} ${p.currency ?? ''}`
  const cap = p.cap ? t('deals.ballot.cap', { cap: n(p.cap, { maximumFractionDigits: 0 }) }) : ''
  return t('deals.ballot.proposal', { amount, instrument: p.instrument ?? '', cap })
})

const timeLeft = computed(() => {
  if (!props.round.closesAt) return ''
  const ms = new Date(props.round.closesAt).getTime() - now.value
  if (ms <= 0) return t('deals.ballot.closing')
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return t('deals.ballot.timeLeft', { h, m })
})

const segments = computed(() => {
  const x = props.round.tally!
  const total = Math.max(x.eligible, x.yes + x.no + x.blank + x.defaultBlank + x.notVoted, 1)
  return [
    { key: 'yes', pct: (x.yes / total) * 100 },
    { key: 'no', pct: (x.no / total) * 100 },
    { key: 'blank', pct: ((x.blank + x.defaultBlank) / total) * 100 },
    { key: 'none', pct: (x.notVoted / total) * 100 },
  ]
})

const countsLine = computed(() => {
  const x = props.round.tally!
  const base = t('deals.ballot.counts', { yes: x.yes, no: x.no, blank: x.blank, none: x.notVoted })
  return x.defaultBlank ? `${base} ${t('deals.ballot.countsDefault', x.defaultBlank)}` : base
})

function errorText(e: any) {
  return e?.data?.message || e?.message || t('deals.qa.error')
}

async function vote(choice: string) {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/rounds/${props.round.id}/ballot`, {
      method: 'POST',
      body: { choice, attested: props.round.bundleSha256 },
    })
    $posthog?.capture?.('deal_ballot_cast', { slug: props.slug })
    emit('changed')
  } catch (e: any) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}

// The people the committee can name on the close screen, fetched only when needed.
watch(
  () => props.round.close?.missing?.length,
  async (missing) => {
    if (!missing || candidates.value.length) return
    try {
      const data = await $fetch<{ candidates?: { id: string; name: string }[] }>(
        `/api/member/deals/${props.slug}/ledger`,
      )
      candidates.value = data.candidates ?? []
    } catch (e: any) {
      error.value = errorText(e)
    }
  },
  { immediate: true },
)

const closeReady = computed(() => {
  const missing = props.round.close?.missing ?? []
  return (
    (!missing.includes('lead') || Boolean(lead.value)) && (!missing.includes('follow_up_owner') || Boolean(owner.value))
  )
})

async function close() {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/rounds/${props.round.id}/close`, {
      method: 'POST',
      body: { lead: lead.value ?? undefined, followUpOwner: owner.value ?? undefined },
    })
    $posthog?.capture?.('deal_round_closed', { slug: props.slug })
    emit('changed')
  } catch (e: any) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}

async function open() {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/rounds/${props.round.id}/open`, { method: 'POST' })
    confirmOpen.value = false
    emit('changed')
  } catch (e: any) {
    error.value = errorText(e)
    confirmOpen.value = false
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.close-box {
  border: 1px solid rgba(255, 183, 77, 0.5);
  border-radius: 8px;
  padding: 14px 16px;
}
.round + .round {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 16px;
  padding-top: 16px;
}
.round-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 2px 7px;
}
.tag-open {
  background: #ff9800;
  color: #111;
}
.tag-ok {
  background: #4caf50;
  color: #111;
}
.tag-muted {
  color: #bbb;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.line {
  color: #ddd;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 4px;
}
.meta {
  color: #888;
  font-size: 13px;
}
.mine {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
}
.choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 420px;
}
.choice {
  min-height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.choice:hover:not(:disabled),
.choice:focus-visible {
  background: rgba(255, 255, 255, 0.1);
}
.choice.chosen {
  background: #fff;
  color: #111;
  border-color: #fff;
}
.choice:disabled {
  opacity: 0.35;
  cursor: default;
}
.bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  max-width: 420px;
}
.seg-yes {
  background: #66bb6a;
}
.seg-no {
  background: #ef5350;
}
.seg-blank {
  background: #9e9e9e;
}
.seg-none {
  background: rgba(255, 255, 255, 0.12);
}
.counts {
  color: #ddd;
  font-size: 14px;
  margin-bottom: 2px;
}
.protocol {
  display: inline-flex;
  align-items: center;
  color: #fff;
  font-size: 14px;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 8px 12px;
}
.protocol:hover {
  background: rgba(255, 255, 255, 0.08);
}
.named {
  border-left: 2px solid rgba(255, 183, 77, 0.6);
  padding-left: 12px;
}
.named-label {
  color: #ffb74d;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.named-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13.5px;
}
.named-name {
  color: #ddd;
}
.named-choice {
  font-weight: 600;
  text-align: right;
}
.named-meta {
  grid-column: 1 / -1;
  color: #888;
  font-size: 12px;
}
.c-yes {
  color: #81c784;
}
.c-no {
  color: #e57373;
}
.c-blank,
.c-default_blank {
  color: #bdbdbd;
}
.c-none {
  color: #777;
}
</style>
