<template>
  <div class="cases text-left">
    <DealsPreviewBar v-if="data?.preview && data.previewRoles" :roles="data.previewRoles" :current="data.preview.slug" />

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
          <DealsCaseRow v-for="c in data.decided" :key="c.slug" :c="c" :query="linkQuery" />
        </div>
      </section>

      <section v-if="working" class="group">
        <h2 class="group-title">{{ t('deals.overview.active') }} <span class="count">{{ data.active.length }}</span></h2>
        <p class="group-intro">{{ t('deals.overview.activeIntro') }}</p>
        <div v-if="data.active.length" class="rows">
          <DealsCaseRow v-for="c in data.active" :key="c.slug" :c="c" :query="linkQuery" />
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
          <DealsCaseRow v-for="c in data.inactive" :key="c.slug" :c="c" :query="linkQuery" quiet />
        </div>
      </details>

      <section v-if="data.invested.length" class="group">
        <h2 class="group-title">{{ t('deals.overview.invested') }} <span class="count">{{ data.invested.length }}</span></h2>
        <div class="rows">
          <DealsCaseRow v-for="c in data.invested" :key="c.slug" :c="c" :query="linkQuery" />
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
            <DealsCaseRow v-for="c in declined" :key="c.slug" :c="c" :query="linkQuery" quiet />
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
// member's SPV invested in. The committee's view is /member/komite; a committee member
// can look at this page as any role through "Se som ..." (?som=).
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
  canOpen: boolean
}
interface Role {
  slug: string
  name: string | null
  phase: string | null
}
interface Overview {
  viewer: { isCommittee: boolean }
  preview: Role | null
  previewRoles: Role[] | null
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
const route = useRoute()
const { session, checked } = useAuthSession()
const { $posthog } = useNuxtApp()
const loading = ref(true)
const data = ref<Overview | null>(null)
const declined = ref<Row[] | null>(null)
const loadingDeclined = ref(false)

const som = computed(() => (typeof route.query.som === 'string' ? route.query.som : ''))
const linkQuery = computed(() => (som.value ? { som: som.value } : undefined))

watch(
  [() => checked.value && session.value.authenticated, som],
  async ([ready]) => {
    if (!ready) return
    loading.value = true
    declined.value = null
    try {
      data.value = await $fetch<Overview>('/api/member/deals', { query: som.value ? { som: som.value } : {} })
      $posthog?.capture?.('deal_cases_viewed', {
        active: data.value.active.length,
        decided: data.value.decided.length,
        preview: data.value.preview?.slug ?? null,
      })
    } catch {
      // A role preview for someone who is not on the committee: back to their own view.
      if (som.value) await navigateTo('/member/caser', { replace: true })
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

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
    const res = await $fetch<Overview>('/api/member/deals', { query: { declined: '1', ...(linkQuery.value ?? {}) } })
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
