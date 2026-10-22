<template>
  <div class="cases text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('deals.list.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; max-width: 640px;">{{ t('deals.list.intro') }}</p>
      <p v-if="viewer.isStaff" class="staff-note mt-3">
        <v-icon size="14" class="mr-1">mdi-account-tie-outline</v-icon>{{ t('deals.list.staffNote') }}
        <NuxtLink to="/member/komite" class="staff-link">{{ t('deals.list.committeeLink') }}</NuxtLink>
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="!cases.length" style="color: #aaa;">{{ t('deals.list.empty') }}</div>

    <section v-else class="feed">
      <NuxtLink v-for="c in cases" :key="c.slug" :to="`/member/caser/${c.slug}`" class="case-link">
        <v-card class="case-card" variant="outlined">
          <div class="d-flex align-center flex-wrap mb-2" style="gap: 10px;">
            <span class="company-name">{{ c.name }}</span>
            <DealsChips :status="c.status" :round="c.round" />
          </div>
          <p v-if="c.blurb" class="blurb mb-2">{{ c.blurb }}</p>
          <span v-if="c.lastActivityAt" class="meta">
            {{ t('deals.list.lastActivity', { date: formatDate(c.lastActivityAt, 'short') }) }}
          </span>
        </v-card>
      </NuxtLink>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { t } = useI18n()
const { formatDate } = useLocaleDate()

interface CaseRow {
  slug: string
  name: string
  status: string
  blurb: string | null
  lastActivityAt: string | null
  round: {
    id: string
    group: { slug: string; name: string }
    status: string
    closesAt: string | null
    result: string | null
  } | null
}
interface CasesResponse {
  viewer: { isCommittee: boolean; isStaff: boolean }
  cases: CaseRow[]
}

const { session, checked } = useAuthSession()
const loading = ref(true)
const cases = ref<CaseRow[]>([])
const viewer = ref({ isCommittee: false, isStaff: false })
const { $posthog } = useNuxtApp()

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      const data = await $fetch<CasesResponse>('/api/member/deals')
      cases.value = data.cases
      viewer.value = data.viewer
      $posthog?.capture?.('deal_cases_viewed', { case_count: data.cases.length, staff: data.viewer.isStaff })
    } finally {
      loading.value = false
    }
  }
})
</script>

<style scoped>
.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.case-link {
  text-decoration: none;
}
.case-card {
  background: #161616 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  padding: 18px;
  transition: border-color 0.15s ease;
}
.case-link:hover .case-card,
.case-link:focus-visible .case-card {
  border-color: rgba(255, 255, 255, 0.3) !important;
}
.company-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}
.blurb {
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
}
.meta {
  color: #888;
  font-size: 12px;
}
.staff-note {
  color: #ffb74d;
  font-size: 13px;
}
.staff-link {
  color: #ffb74d;
  font-weight: 600;
  margin-left: 6px;
}
</style>
