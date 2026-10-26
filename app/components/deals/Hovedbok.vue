<template>
  <section v-if="book?.applies" class="panel staff-panel">
    <h2 class="panel-title mb-1">{{ t('deals.hovedbok.title') }}</h2>
    <p class="meta mb-4">{{ intro }}</p>

    <div class="block">
      <p class="label">{{ t('deals.hovedbok.drivers') }}</p>
      <p v-if="!book.drivers.length" class="line muted">{{ t('deals.hovedbok.noLead') }}</p>
      <p v-for="d in book.drivers" :key="d.personId" class="line">
        {{ d.name }} <span class="meta">· {{ t(`deals.hovedbok.role.${d.role}`) }}</span>
      </p>
    </div>

    <div class="block">
      <p class="label">{{ t('deals.hovedbok.followUp') }}</p>
      <p v-if="book.followUp.current" class="line">
        {{ book.followUp.current.name }}
        <span class="meta">· {{ t('deals.hovedbok.since', { date: formatDate(book.followUp.current.since, 'short') }) }}</span>
      </p>
      <p v-else class="line muted">{{ t('deals.hovedbok.noOwner') }}</p>

      <div v-if="book.followUp.history.length > 1" class="history mt-2">
        <p v-for="h in book.followUp.history" :key="`${h.personId}-${h.validFrom}`" class="meta">
          {{ h.name }}:
          {{ t('deals.hovedbok.period', { from: formatDate(h.validFrom, 'short'), to: h.validTo ? formatDate(h.validTo, 'short') : t('deals.hovedbok.now') }) }}
          · {{ t('deals.hovedbok.months', { m: n(h.monthsHeld, { maximumFractionDigits: 1 }) }) }} · {{ pct(h.share * 100) }}
        </p>
      </div>

      <div class="handover mt-3">
        <v-select
          v-model="newOwner"
          :items="handoverCandidates"
          item-title="name"
          item-value="id"
          :label="book.followUp.current ? t('deals.hovedbok.handOver') : t('deals.hovedbok.setOwner')"
          density="compact"
          variant="outlined"
          hide-details
          class="owner-select"
        />
        <v-btn :disabled="!newOwner" :loading="busy" variant="outlined" @click="confirmHandover = true">{{ t('deals.hovedbok.save') }}</v-btn>
      </div>
      <v-dialog v-model="confirmHandover" max-width="440">
        <v-card theme="dark" class="pa-5">
          <p class="mb-4" style="font-size: 15px; line-height: 1.5;">{{ handoverText }}</p>
          <div class="d-flex justify-end" style="gap: 8px;">
            <v-btn variant="text" @click="confirmHandover = false">{{ t('common.cancel') }}</v-btn>
            <v-btn :loading="busy" style="background-color: white; color: #111;" @click="handOver">{{ t('deals.hovedbok.confirm') }}</v-btn>
          </div>
        </v-card>
      </v-dialog>
    </div>

    <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3">{{ error }}</v-alert>

    <!-- One frozen snapshot per closed CTORI4 vote: never edited (a change is a new dated row). -->
    <div v-for="r in book.rounds" :key="r.id" class="snapshot mt-5">
      <p class="line mb-1">
        <strong>{{ t('deals.hovedbok.snapshot', { group: r.group, date: formatDate(r.closedAt, 'short') }) }}</strong>
        <span class="meta"> · {{ t(`deals.round.result.${r.result}`) }}</span>
      </p>
      <p class="meta mb-3">
        {{ r.recordedBy ? t('deals.hovedbok.recordedBy', { name: r.recordedBy }) : t('deals.hovedbok.recordedByJob') }}
      </p>
      <p v-if="r.result !== 'passed'" class="meta">{{ t('deals.hovedbok.notPassed') }}</p>
      <div v-for="part in r.result === 'passed' ? parts(r) : []" :key="part.key" class="part">
        <p class="part-head">
          <span>{{ t(`deals.hovedbok.part.${part.key}`) }}</span>
          <span class="part-pct">{{ pct(part.pct) }}</span>
        </p>
        <p v-if="!part.shares.length" class="meta">{{ t('deals.hovedbok.nobody') }}</p>
        <p v-for="s in part.shares" :key="s.personId" class="share">
          <span>{{ s.name }}</span><span class="meta">{{ pct(s.pct) }}</span>
        </p>
        <p class="meta how">
          {{ part.adjusted ? t('deals.hovedbok.adjusted', { reason: part.adjusted.reason }) : t(`deals.hovedbok.default.${part.key}`) }}
        </p>
      </div>
    </div>
    <p v-if="!book.rounds.length" class="meta mt-4">{{ t('deals.hovedbok.noSnapshot') }}</p>
  </section>
</template>

<script setup lang="ts">
// The hovedbok (dc-39): who earns the incentive on a CTORI4 investment. Committee
// only, and only for a deal a CTORI4 vote touches. The snapshot is frozen when the
// vote closes; the follow-up owner can be handed over here, dated, and the months
// each held set their share. Server: server/utils/dealLedger.ts.
interface Share {
  personId: string
  name: string
  pct: number
}
interface Part {
  shares: Share[]
  adjusted: { reason: string; changedBy: string; at: string } | null
}
interface LedgerRound {
  id: string
  group: string
  closedAt: string
  result: string
  pct: { total: number; followUp: number; committee: number; drivers: number }
  recordedBy: string | null
  committee: Part
  driverShares: Part
  followUp: Part
}
interface Book {
  applies: boolean
  model: { totalPct: number; followUpPct: number; committeePct: number; driversPct: number } | null
  rounds: LedgerRound[]
  drivers: { personId: string; role: string; name: string }[]
  followUp: {
    current: { personId: string; name: string; since: string } | null
    history: {
      personId: string
      name: string
      validFrom: string
      validTo: string | null
      current: boolean
      monthsHeld: number
      share: number
    }[]
  }
  candidates: { id: string; name: string }[]
}

const props = defineProps<{ slug: string }>()

const { t, n } = useI18n()
const { formatDate } = useLocaleDate()

const book = ref<Book | null>(null)
const newOwner = ref<string | null>(null)
const confirmHandover = ref(false)
const busy = ref(false)
const error = ref('')

async function load() {
  try {
    book.value = await $fetch<Book>(`/api/member/deals/${props.slug}/ledger`)
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || t('deals.qa.error')
  }
}
onMounted(load)

// A no-break space, so a share never wraps away from its % sign.
const pct = (x: number) => `${n(x, { maximumFractionDigits: 2 })}\u00a0%`

const intro = computed(() => {
  const m = book.value?.model
  if (!m) return t('deals.hovedbok.introNoModel')
  return t('deals.hovedbok.intro', {
    total: m.totalPct,
    followUp: m.followUpPct,
    committee: m.committeePct,
    drivers: m.driversPct,
  })
})

const handoverCandidates = computed(() =>
  (book.value?.candidates ?? []).filter((c) => c.id !== book.value?.followUp.current?.personId),
)

const handoverText = computed(() => {
  const to = handoverCandidates.value.find((c) => c.id === newOwner.value)?.name ?? ''
  const from = book.value?.followUp.current?.name
  return from ? t('deals.hovedbok.confirmHandOver', { from, to }) : t('deals.hovedbok.confirmSet', { to })
})

function parts(r: LedgerRound) {
  return [
    { key: 'followUp', pct: r.pct.followUp, ...r.followUp },
    { key: 'committee', pct: r.pct.committee, ...r.committee },
    { key: 'drivers', pct: r.pct.drivers, ...r.driverShares },
  ]
}

async function handOver() {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/ledger/follow-up-owner`, {
      method: 'POST',
      body: { personId: newOwner.value },
    })
    newOwner.value = null
    await load()
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || t('deals.qa.error')
  } finally {
    busy.value = false
    confirmHandover.value = false
  }
}
</script>

<style scoped>
.label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #ffb74d;
  margin-bottom: 4px;
}
.block + .block {
  margin-top: 16px;
}
.line {
  color: #ddd;
  font-size: 14.5px;
}
.muted {
  color: #999;
}
.meta {
  color: #888;
  font-size: 13px;
}
.handover {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.owner-select {
  flex: 1 1 220px;
  max-width: 340px;
}
.snapshot {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 14px;
}
.part + .part {
  margin-top: 12px;
}
.part-head {
  display: flex;
  justify-content: space-between;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 2px;
}
.part-pct {
  color: #ffb74d;
}
.share {
  display: flex;
  justify-content: space-between;
  color: #ddd;
  font-size: 14px;
  padding-left: 10px;
}
.how {
  padding-left: 10px;
  margin-top: 2px;
}
</style>
