<template>
  <div class="pipeline text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('deals.pipeline.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; max-width: 640px;">
        {{ onlyInvested ? t('deals.pipeline.introInvested') : t('deals.pipeline.intro') }}
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <template v-else>
      <section v-if="!onlyInvested" class="mb-8">
        <h2 class="section-title mb-3">{{ t('deals.pipeline.working') }}</h2>
        <p v-if="!working.length" style="color: #aaa; font-size: 14px;">{{ t('deals.pipeline.workingEmpty') }}</p>
        <article v-for="d in working" :key="d.slug" class="row-card">
          <div class="d-flex align-center flex-wrap mb-1" style="gap: 10px;">
            <NuxtLink :to="`/member/caser/${d.slug}`" class="company-name">{{ d.name }}</NuxtLink>
            <span v-if="d.openRound" class="tag tag-open">{{ t('deals.pipeline.voteOpen') }}</span>
            <span v-else class="tag">{{ statusLabel(d.status) }}</span>
          </div>
          <p v-if="d.blurb" class="blurb mb-1">{{ d.blurb }}</p>
          <p class="meta mb-3">{{ metaLine(d) }}</p>
          <div class="actions">
            <NuxtLink :to="`/member/caser/${d.slug}#qa`" class="action">{{ t('deals.pipeline.ask') }}</NuxtLink>
            <NuxtLink :to="`/member/caser/${d.slug}?innspill=objection#innspill`" class="action">{{ t('deals.pipeline.object') }}</NuxtLink>
            <NuxtLink :to="`/member/caser/${d.slug}?innspill=signal#innspill`" class="action">{{ t('deals.pipeline.knowThem') }}</NuxtLink>
          </div>
        </article>
      </section>

      <section v-if="invested.length" class="mb-8">
        <h2 class="section-title mb-3">{{ t('deals.pipeline.invested') }}</h2>
        <article v-for="d in invested" :key="d.slug" class="row-card">
          <div class="d-flex align-center flex-wrap mb-1" style="gap: 10px;">
            <NuxtLink :to="`/member/caser/${d.slug}`" class="company-name">{{ d.name }}</NuxtLink>
            <span class="tag">{{ statusLabel(d.status) }}</span>
          </div>
          <p v-if="d.blurb" class="blurb mb-1">{{ d.blurb }}</p>
          <p class="meta">{{ metaLine(d) }}</p>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// The pipeline feed (decision 2026-10-22 §6): what the committee is working on,
// for the SPV that is deploying, in review first, with one-tap ways to ask, object
// or say "I know them" on each. Members of a completed SPV see only its companies.
definePageMeta({ layout: 'member' })

interface Row {
  slug: string
  name: string
  status: string
  blurb: string | null
  owner: string | null
  lastActivityAt: string | null
  ours: boolean
  openRound: { closesAt: string; group: string } | null
}

const { t, te } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const { $posthog } = useNuxtApp()
const loading = ref(true)
const working = ref<Row[]>([])
const invested = ref<Row[]>([])

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      const data = await $fetch<{ working: Row[]; invested: Row[] }>('/api/member/pipeline')
      working.value = data.working
      invested.value = data.invested
      $posthog?.capture?.('deal_pipeline_viewed', { working: data.working.length, invested: data.invested.length })
    } finally {
      loading.value = false
    }
  }
})

// A member of a completed SPV sees only its own companies: no working list to invite input on.
const onlyInvested = computed(() => !working.value.length && invested.value.length > 0)

const statusLabel = (s: string) => (te(`deals.status.${s}`) ? t(`deals.status.${s}`) : s)

function metaLine(d: Row) {
  const parts = []
  if (d.owner) parts.push(t('deals.case.owner', { name: d.owner }))
  if (d.lastActivityAt) parts.push(t('deals.list.lastActivity', { date: formatDate(d.lastActivityAt, 'short') }))
  return parts.join(' · ')
}
</script>

<style scoped>
.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
}
.row-card {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 10px;
}
.company-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
}
.company-name:hover {
  text-decoration: underline;
}
.tag {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #bbb;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 2px 7px;
}
.tag-open {
  color: #111;
  background: #ff9800;
  border-color: #ff9800;
  font-weight: 700;
}
.blurb {
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
}
.meta {
  color: #888;
  font-size: 12.5px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action {
  font-size: 13px;
  color: #fff;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
}
.action:hover,
.action:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
</style>
