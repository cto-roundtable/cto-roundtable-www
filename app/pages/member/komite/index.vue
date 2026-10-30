<template>
  <div class="committee text-left">
    <header class="page-head">
      <h1 class="page-title">{{ t('deals.committee.title') }}</h1>
      <p class="intro">{{ t('deals.committee.intro') }}</p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>
    <p v-else-if="forbidden" class="empty">{{ t('deals.committee.forbidden') }}</p>

    <template v-else>
      <section v-if="drafts.length" class="group">
        <h2 class="group-title">{{ t('deals.pipelineDigest.toApprove') }} <span class="count">{{ drafts.length }}</span></h2>
        <DealsPipelineDigestReview v-for="d in drafts" :key="d.id" :digest="d" class="mb-3" @changed="reload" />
      </section>

      <!-- New leads ('incoming'): the committee's only, folded with the count (Snorre, 2026-10-30). -->
      <details class="group group-fold leads" :open="leadsOpen" @toggle="leadsOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="group-title">
          <v-icon size="20" class="fold-icon" aria-hidden="true">mdi-chevron-right</v-icon>
          {{ t('deals.lead.title') }} <span class="count">{{ leads.length }}</span>
          <span class="only-committee"><v-icon size="13" aria-hidden="true">mdi-lock-outline</v-icon>{{ t('deals.case.onlyCommittee') }}</span>
        </summary>
        <p class="fold-intro">{{ t('deals.lead.intro') }}</p>
        <p v-if="!leads.length" class="empty">{{ t('deals.lead.empty') }}</p>
        <div v-if="newLeads.length" class="lead-list">
          <DealsLead v-for="l in newLeads" :key="l.slug" :lead="l" @moved="onMoved" />
        </div>
        <details v-if="quietLeads.length" class="group-fold quiet">
          <summary class="sub-fold">
            <v-icon size="18" class="fold-icon" aria-hidden="true">mdi-chevron-right</v-icon>
            {{ t('deals.lead.inactive', { weeks: Math.round(inactiveAfterDays / 7) }) }} <span class="count">{{ quietLeads.length }}</span>
          </summary>
          <div class="lead-list">
            <DealsLead v-for="l in quietLeads" :key="l.slug" :lead="l" @moved="onMoved" />
          </div>
        </details>
      </details>
      <p v-if="moved" class="moved" role="status">
        {{ t('deals.lead.moved', { name: moved.name, status: t(`deals.status.${moved.status}`) }) }}
        <NuxtLink v-if="moved.status !== 'passed'" :to="`/member/caser/${moved.slug}`">{{ t('deals.lead.openCase') }}</NuxtLink>
      </p>

      <!-- What waits, summed over every case: zero is said plainly, never left out. -->
      <dl class="totals" :aria-label="t('deals.committee.totalsAria')">
        <div v-for="k in COUNTS" :key="k" class="total" :class="{ hot: totals[k] > 0 }">
          <dt>{{ t(`deals.committee.count.${k}`) }}</dt>
          <dd>{{ totals[k] }}</dd>
        </div>
      </dl>

      <p v-if="!cases.length" class="empty">{{ t('deals.committee.empty') }}</p>

      <template v-for="g in groups" :key="g.key">
        <component :is="g.key === 'inactive' ? 'details' : 'section'" v-if="g.rows.length" class="group" :class="{ 'group-fold': g.key === 'inactive' }">
          <component :is="g.key === 'inactive' ? 'summary' : 'h2'" class="group-title">
            <v-icon v-if="g.key === 'inactive'" size="20" class="fold-icon" aria-hidden="true">mdi-chevron-right</v-icon>
            {{ t(`deals.overview.${g.key}`) }} <span class="count">{{ g.rows.length }}</span>
          </component>
          <table class="waits-table">
            <thead>
              <tr>
                <th scope="col">{{ t('deals.committee.caseCol') }}</th>
                <th v-for="k in COUNTS" :key="k" scope="col" class="num">{{ t(`deals.committee.count.${k}`) }}</th>
                <th scope="col" class="num">{{ t('deals.committee.lastCol') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in g.rows" :key="c.slug" :class="{ waiting: c.waiting > 0 }">
                <th scope="row" class="case-cell">
                  <NuxtLink :to="`/member/caser/${c.slug}`" class="case-name">{{ c.name }}</NuxtLink>
                  <span class="case-state">{{ stateLine(c) }}</span>
                  <details v-if="c.digest" class="digest">
                    <summary>{{ t('deals.committee.digest', { date: formatDate(c.digest.createdAt, 'short') }) }}</summary>
                    <DealsDigest :digest="c.digest" class="mt-2" />
                  </details>
                </th>
                <td v-for="k in COUNTS" :key="k" class="num" :class="{ hot: c[k] > 0 }" :data-label="t(`deals.committee.count.${k}`)">
                  {{ c[k] }}
                </td>
                <td class="num last" :data-label="t('deals.committee.lastCol')">
                  {{ c.lastActivityAt ? formatDate(c.lastActivityAt, 'short') : '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </component>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
// The committee's overview across cases: every case in active work with what waits
// for the committee (questions routed to the owner, agent answers to confirm, new
// comments since the last digest, questions still with the agent), zero counts shown,
// grouped like the member overview; and the new leads ('incoming'), folded, with the
// moves out of 'incoming'. Committee only (the board sees what a member
// sees): server/api/member/committee/overview.get.ts.
definePageMeta({ layout: 'member' })

const COUNTS = ['questionsRouted', 'answersUnconfirmed', 'commentsSinceDigest', 'questionsOpen'] as const
type CountKey = (typeof COUNTS)[number]

interface CommitteeCase extends Record<CountKey, number> {
  slug: string
  name: string
  status: string
  owner: string | null
  coLeads: string[]
  lastActivityAt: string | null
  comments: number
  round: { status: string; result: string | null; closesAt: string | null; group: { name: string } } | null
  digest: any | null
  section: 'decided' | 'active' | 'inactive'
  waiting: number
}

const { t, te } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const loading = ref(true)
const forbidden = ref(false)
const cases = ref<CommitteeCase[]>([])
const drafts = ref<any[]>([])
// The new leads, typed where they are drawn (DealsLead).
const leads = ref<any[]>([])
const inactiveAfterDays = ref(56)
const leadsOpen = ref(false)
const moved = ref<{ slug: string; name: string; status: string } | null>(null)

async function reload() {
  const data = await $fetch<{
    cases: CommitteeCase[]
    leads: any[]
    inactiveAfterDays: number
    pipelineDigests: { drafts: any[] }
  }>('/api/member/committee/overview')
  cases.value = data.cases
  leads.value = data.leads
  inactiveAfterDays.value = data.inactiveAfterDays
  drafts.value = data.pipelineDigests.drafts
}

// Sorted by the server: newest activity (else when it came in) first.
const newLeads = computed(() => leads.value.filter((l) => l.section === 'new'))
const quietLeads = computed(() => leads.value.filter((l) => l.section === 'inactive'))

/** A lead left 'incoming': say where it went, and re-read (it may now be a case below). */
async function onMoved(m: { slug: string; name: string; status: string }) {
  moved.value = m
  await reload()
}

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      await reload()
    } catch {
      forbidden.value = true
    } finally {
      loading.value = false
    }
  }
})

const totals = computed(
  () =>
    Object.fromEntries(COUNTS.map((k) => [k, cases.value.reduce((sum, c) => sum + c[k], 0)])) as Record<
      CountKey,
      number
    >,
)

const groups = computed(() =>
  (['active', 'decided', 'inactive'] as const).map((key) => ({
    key,
    rows: cases.value.filter((c) => c.section === key),
  })),
)

function stateLine(c: CommitteeCase) {
  const parts = []
  if (c.round?.status === 'open') parts.push(t('deals.round.status.open'))
  else if (c.round?.status === 'draft') parts.push(t('deals.committee.draftRound'))
  else parts.push(te(`deals.status.${c.status}`) ? t(`deals.status.${c.status}`) : c.status)
  const drivers = [c.owner, ...c.coLeads].filter(Boolean)
  if (drivers.length) parts.push(drivers.join(', '))
  return parts.join(' · ')
}
</script>

<style scoped>
.page-head {
  margin-bottom: 28px;
}
.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 10px;
}
.intro {
  color: #bbb;
  font-size: 15px;
  line-height: 1.55;
  max-width: 62ch;
  margin: 0;
}
.empty {
  color: #aaa;
  font-size: 14px;
}
.totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  margin: 0 0 40px;
}
.total {
  background: #161616;
  padding: 12px 16px;
}
.total dt {
  color: #aaa;
  font-size: 13px;
  line-height: 1.35;
}
.total dd {
  font-size: 1.5rem;
  font-weight: 600;
  color: #888;
  margin: 2px 0 0;
  font-variant-numeric: tabular-nums;
}
.total.hot dd {
  color: #fff;
}
.group {
  margin-bottom: 40px;
}
.group-title {
  font-size: 1.15rem;
  font-weight: 650;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
}
.count {
  font-size: 13px;
  font-weight: 500;
  color: #aaa;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 1px 9px;
}
.group-fold > summary {
  cursor: pointer;
  list-style: none;
  min-height: 40px;
}
.group-fold > summary::-webkit-details-marker {
  display: none;
}
.fold-icon {
  color: #aaa;
  margin-left: -4px;
  transition: transform 0.15s ease;
}
.group-fold[open] > summary .fold-icon {
  transform: rotate(90deg);
}
.leads {
  margin-bottom: 32px;
}
.fold-intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.55;
  max-width: 66ch;
  margin: 0 0 12px;
}
.lead-list {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
}
.quiet {
  margin-top: 14px;
}
.sub-fold {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
  font-size: 14.5px;
  font-weight: 600;
  margin-bottom: 10px;
}
.only-committee {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #aaa;
  font-size: 12.5px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 1px 9px;
}
.moved {
  color: #ddd;
  font-size: 14px;
  margin: -16px 0 28px;
}
.moved a {
  color: #fff;
  margin-left: 6px;
}
.waits-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  font-size: 14px;
}
.waits-table thead th {
  color: #999;
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  vertical-align: bottom;
}
.waits-table tbody th,
.waits-table tbody td {
  padding: 12px 14px;
  vertical-align: top;
  text-align: left;
  font-weight: 400;
}
.waits-table tbody tr + tr > * {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.waits-table .num {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  width: 1%;
}
.waits-table thead .num {
  white-space: normal;
  min-width: 84px;
}
td.num {
  color: #777;
}
td.num.hot {
  color: #ffb74d;
  font-weight: 700;
}
td.last {
  color: #999;
}
.case-name {
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}
.case-name:hover,
.case-name:focus-visible {
  text-decoration: underline;
}
.case-state {
  display: block;
  color: #999;
  font-size: 13px;
  margin-top: 2px;
}
.digest {
  margin-top: 6px;
}
.digest summary {
  cursor: pointer;
  color: #ccc;
  font-size: 13px;
  min-height: 28px;
  display: flex;
  align-items: center;
}

@media (max-width: 700px) {
  .totals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .waits-table thead {
    display: none;
  }
  .waits-table,
  .waits-table tbody,
  .waits-table tr {
    display: block;
  }
  .waits-table tbody tr {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding: 12px 14px;
  }
  .waits-table tbody tr + tr {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .waits-table tbody tr + tr > * {
    border-top: none;
  }
  .waits-table tbody th,
  .waits-table tbody td {
    padding: 0;
  }
  .waits-table tbody th {
    flex: 1 0 100%;
  }
  .waits-table .num {
    width: auto;
    text-align: left;
    font-size: 13px;
  }
  .waits-table td.num::before {
    content: attr(data-label) ' ';
    color: #999;
    font-weight: 400;
  }
}
</style>
