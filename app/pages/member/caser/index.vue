<template>
  <div class="cases text-left">
    <header class="page-head">
      <h1 class="page-title">{{ t('deals.list.title') }}</h1>
      <p class="intro">{{ intro }}</p>
      <p v-if="data?.audience.length" class="audience">
        <v-icon size="15" class="mr-1" aria-hidden="true">mdi-account-group-outline</v-icon>
        {{ t('deals.overview.audience', { groups: data.audience.join(', ') }) }}
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <template v-else-if="data">
      <details v-if="data.latestDigest && working" class="digest-box">
        <summary>{{ t('deals.pipelineDigest.latest', { date: formatDate(data.latestDigest.periodStart, 'short') }) }}</summary>
        <!-- Rendered from a strict, escape-first markdown subset (no raw HTML). -->
        <div class="d-body mt-3" v-html="renderMarkdown(data.latestDigest.bodyMd)" />
      </details>

      <section v-if="data.decided.length" class="group">
        <h2 class="group-title">{{ t('deals.overview.decided') }} <span class="count">{{ data.decided.length }}</span></h2>
        <p class="group-intro">{{ t('deals.overview.decidedIntro') }}</p>
        <div class="rows">
          <DealsCaseRow v-for="c in data.decided" :key="c.slug" :c="c" />
        </div>
      </section>

      <section v-if="working" class="group">
        <h2 class="group-title">{{ t('deals.overview.active') }} <span class="count">{{ data.active.length }}</span></h2>
        <p class="group-intro">{{ t('deals.overview.activeIntro') }}</p>
        <div v-if="data.active.length" class="rows">
          <DealsCaseRow v-for="c in data.active" :key="c.slug" :c="c" />
        </div>
        <p v-else class="empty">{{ t('deals.overview.activeEmpty') }}</p>
      </section>

      <details v-if="data.inactive.length" class="group group-fold">
        <summary class="group-title">
          <v-icon size="20" class="fold-icon" aria-hidden="true">mdi-chevron-right</v-icon>
          {{ t('deals.overview.inactive') }} <span class="count">{{ data.inactive.length }}</span>
        </summary>
        <p class="group-intro">{{ t('deals.overview.inactiveIntro', { weeks: Math.round(data.inactiveAfterDays / 7) }) }}</p>
        <div class="rows">
          <DealsCaseRow v-for="c in data.inactive" :key="c.slug" :c="c" quiet />
        </div>
      </details>

      <section v-if="data.invested.length" class="group">
        <h2 class="group-title">{{ t(spvs.length > 1 ? 'deals.overview.investedMany' : 'deals.overview.invested') }} <span class="count">{{ investedShown.length }}</span></h2>
        <p class="group-intro">{{ t('deals.overview.investedIntro') }}</p>
        <div class="invested-tools">
          <!-- More than one SPV: filter by it (every row carries its SPV tags either way). -->
          <div v-if="spvs.length > 1" class="spv-filter" role="group" :aria-label="t('deals.overview.spvFilter')">
            <button
              v-for="f in [{ slug: '', name: t('deals.overview.allSpvs') }, ...spvs]"
              :key="f.slug"
              type="button"
              class="spv-chip"
              :aria-pressed="spvFilter === f.slug"
              @click="spvFilter = f.slug"
            >
              {{ f.name }}
            </button>
          </div>
          <label class="sort">
            <span>{{ t('deals.overview.sortLabel') }}</span>
            <select v-model="investedSort" class="sort-select">
              <option v-for="o in SORTS" :key="o" :value="o">{{ t(`deals.overview.sort.${o}`) }}</option>
            </select>
          </label>
        </div>
        <div class="rows">
          <DealsCaseRow v-for="c in investedShown" :key="c.slug" :c="c" invested />
        </div>
      </section>

      <!-- Declined companies, only on request (dc-33 H1): name, stage and date, no actions. -->
      <section v-if="working" class="group">
        <button v-if="declined === null" type="button" class="more" :disabled="loadingDeclined" @click="loadDeclined">
          {{ t('deals.overview.showDeclined') }}
        </button>
        <template v-else>
          <h2 class="group-title">{{ t('deals.overview.declined') }} <span class="count">{{ declined.length }}</span></h2>
          <p class="group-intro">{{ t('deals.overview.declinedIntro') }}</p>
          <div v-if="declined.length" class="rows">
            <DealsCaseRow v-for="c in declined" :key="c.slug" :c="c" quiet />
          </div>
          <p v-else class="empty">{{ t('deals.overview.declinedEmpty') }}</p>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// The one cases overview, always the MEMBER view (Snorre, 2026-10-29): decided cases
// on top, then what is under review now, the quiet ones folded away, and what the
// member's own SPVs invested in, each tagged with its SPV. The committee's view is
// /member/komite. Nobody can look at it as another role (Snorre, 2026-10-30).
definePageMeta({ layout: 'member' })

interface Row {
  slug: string
  name: string
  status: string
  blurb: string | null
  owner: string | null
  lastActivityAt: string | null
  round: {
    status: string
    result: string | null
    closesAt: string | null
    closedAt: string | null
    group: { slug: string; name: string }
  } | null
  ours: boolean
  spvs: { slug: string; name: string }[]
  investedAt: string | null
  coLeads: string[]
  canOpen: boolean
}
interface Overview {
  viewer: { isCommittee: boolean }
  audience: string[]
  decided: Row[]
  active: Row[]
  inactive: Row[]
  invested: Row[]
  declined: Row[] | null
  inactiveAfterDays: number
  latestDigest: { periodStart: string; bodyMd: string } | null
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const { $posthog } = useNuxtApp()
const loading = ref(true)
const data = ref<Overview | null>(null)
const declined = ref<Row[] | null>(null)
const loadingDeclined = ref(false)

watch(
  () => checked.value && session.value.authenticated,
  async (ready) => {
    if (!ready) return
    loading.value = true
    try {
      data.value = await $fetch<Overview>('/api/member/deals')
      $posthog?.capture?.('deal_cases_viewed', {
        active: data.value.active.length,
        decided: data.value.decided.length,
        invested: data.value.invested.length,
      })
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

// The SPVs behind the invested list, for the filter (one tag per SPV per company).
const spvs = computed(() => {
  const all = new Map<string, string>()
  for (const c of data.value?.invested ?? []) for (const g of c.spvs) all.set(g.slug, g.name)
  return [...all].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.slug.localeCompare(b.slug))
})
const spvFilter = ref('')
// The server sends the newest investment first; the other orders are client-side.
const SORTS = ['invested', 'activity', 'name'] as const
const investedSort = ref<(typeof SORTS)[number]>('invested')
const time = (d: string | null) => (d ? new Date(d).getTime() : Number.NEGATIVE_INFINITY)
const investedShown = computed(() => {
  const rows = (data.value?.invested ?? []).filter(
    (c) => !spvFilter.value || c.spvs.some((g) => g.slug === spvFilter.value),
  )
  if (investedSort.value === 'activity')
    return [...rows].sort((a, b) => time(b.lastActivityAt) - time(a.lastActivityAt) || a.name.localeCompare(b.name))
  if (investedSort.value === 'name') return [...rows].sort((a, b) => a.name.localeCompare(b.name))
  return rows
})

// The working pipeline is for the SPV investing now; a completed SPV sees its own companies.
const working = computed(() => Boolean(data.value?.audience.length))

const intro = computed(() => {
  if (!data.value) return ''
  if (working.value) return t('deals.overview.intro')
  if (data.value.invested.length) return t('deals.overview.introInvested')
  return t('deals.overview.introNone')
})

async function loadDeclined() {
  loadingDeclined.value = true
  try {
    const res = await $fetch<Overview>('/api/member/deals', { query: { declined: '1' } })
    declined.value = res.declined ?? []
    $posthog?.capture?.('deal_pipeline_declined_viewed', { declined: declined.value.length })
  } finally {
    loadingDeclined.value = false
  }
}
</script>

<style scoped>
.page-head {
  margin-bottom: 36px;
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
.audience {
  color: #aaa;
  font-size: 13px;
  display: flex;
  align-items: center;
  margin: 10px 0 0;
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
  margin: 0 0 4px;
}
.count {
  font-size: 13px;
  font-weight: 500;
  color: #aaa;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 1px 9px;
}
.group-intro {
  color: #999;
  font-size: 13.5px;
  line-height: 1.5;
  max-width: 64ch;
  margin: 0 0 12px;
}
.rows {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
}
.group-fold > summary {
  cursor: pointer;
  list-style: none;
  min-height: 40px;
  margin-bottom: 4px;
}
.group-fold > summary::-webkit-details-marker {
  display: none;
}
.fold-icon {
  color: #aaa;
  margin-left: -4px;
  transition: transform 0.15s ease;
}
.group-fold[open] .fold-icon {
  transform: rotate(90deg);
}
.group-fold > summary:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 2px;
  border-radius: 4px;
}
.empty {
  color: #aaa;
  font-size: 14px;
}
.more {
  font-size: 14px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  padding: 8px 14px;
  min-height: 40px;
}
.more:hover,
.more:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.invested-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  margin: 0 0 12px;
}
.spv-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sort {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #aaa;
  font-size: 13px;
  margin-left: auto;
}
.sort-select {
  color: #fff;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 5px 28px 5px 10px;
  min-height: 32px;
  font-size: 13px;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #aaa 50%), linear-gradient(135deg, #aaa 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
.sort-select:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 2px;
}
.spv-chip {
  font-size: 13px;
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 4px 12px;
  min-height: 32px;
}
.spv-chip:hover,
.spv-chip:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.spv-chip[aria-pressed='true'] {
  background: #fff;
  border-color: #fff;
  color: #111;
}
.digest-box {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 36px;
}
.digest-box summary {
  cursor: pointer;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}
.d-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
}
.d-body :deep(p) {
  margin: 0 0 10px;
}
.d-body :deep(ul) {
  margin: 0 0 10px;
  padding-left: 20px;
}
</style>
