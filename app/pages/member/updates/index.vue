<template>
  <div class="updates text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Investoroppdateringer</h1>
      <p style="color: #aaa; font-size: 14px;">
        Oppdateringer fra porteføljeselskapene i kohortene du er med i.
      </p>
      <div v-if="memberCohorts.length" class="d-flex align-center flex-wrap mt-3" style="gap: 8px;">
        <span style="color: #888; font-size: 13px;">Dine investeringsgrupper:</span>
        <v-chip
          v-for="cohort in memberCohorts"
          :key="cohort"
          color="#4caf50"
          variant="flat"
          size="small"
          class="font-weight-bold"
        >
          {{ cohort }}
        </v-chip>
      </div>
    </header>

    <div v-if="companies.length" class="filter-bar mb-5">
      <v-autocomplete
        v-model="selectedSlugs"
        :items="companyItems"
        item-title="company"
        item-value="slug"
        label="Filtrer på selskap"
        placeholder="Alle selskaper"
        density="comfortable"
        variant="outlined"
        hide-details
        multiple
        chips
        closable-chips
        clearable
        theme="dark"
        style="max-width: 480px;"
      />
    </div>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="!updates.length" style="color: #aaa;">
      Ingen oppdateringer er lagt inn ennå.
    </div>

    <section v-else class="feed">
      <NuxtLink
        v-for="u in updates"
        :key="u.id"
        :to="`/member/updates/${u.slug}#update-${u.id}`"
        class="feed-card-link"
      >
        <v-card class="feed-card" variant="outlined">
          <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px;">
            <span class="company-name">{{ u.company }}</span>
            <v-chip
              v-for="cohort in u.cohorts"
              :key="cohort"
              color="#2196f3"
              variant="flat"
              size="x-small"
              class="text-uppercase font-weight-bold"
              style="letter-spacing: 0.05em;"
            >
              {{ cohort }}
            </v-chip>
            <v-chip
              v-if="u.kind === 'notice'"
              color="#ff9800"
              variant="flat"
              size="x-small"
              class="text-uppercase font-weight-bold"
            >
              Notis
            </v-chip>
          </div>

          <p class="latest-title mb-1">{{ u.title }}</p>
          <p v-if="u.headline" class="latest-headline mb-2">{{ u.headline }}</p>

          <span class="meta">{{ formatDate(u.updateDate) }}</span>
        </v-card>
      </NuxtLink>

      <div v-if="hasMore" class="d-flex justify-center mt-5">
        <v-btn
          :loading="loadingMore"
          variant="outlined"
          color="white"
          @click="loadMore"
        >
          Last inn flere
        </v-btn>
      </div>
      <p v-else class="text-center meta mt-5">
        Viser alle {{ total }} {{ total === 1 ? 'oppdatering' : 'oppdateringer' }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const PAGE_SIZE = 20

interface UpdateRow {
  id: string
  slug: string
  company: string
  cohorts: string[]
  kind: 'update' | 'notice'
  updateDate: string
  title: string
  headline: string | null
}
interface CompanyOption {
  slug: string
  company: string
}
interface UpdatesResponse {
  memberCohorts: string[]
  companies: CompanyOption[]
  total: number
  hasMore: boolean
  updates: UpdateRow[]
}

const { session, checked } = useAuthSession()
const loading = ref(true)
const loadingMore = ref(false)
const updates = ref<UpdateRow[]>([])
const companies = ref<CompanyOption[]>([])
const memberCohorts = ref<string[]>([])
const selectedSlugs = ref<string[]>([])
const total = ref(0)
const hasMore = ref(false)
const { $posthog } = useNuxtApp()

// "Alle selskaper" is the empty selection (no chips); the placeholder covers it. Any
// number of companies can be selected — each adds a removable chip and a ?slugs param.
const companyItems = computed(() => companies.value)

// Fetch a page. reset=true replaces the feed (initial load / filter change); otherwise
// it appends the next page. Server always returns the companies + cohort lists, cheap
// enough to refresh each call and keeps the dropdown correct on first paint.
async function fetchPage(reset: boolean) {
  const offset = reset ? 0 : updates.value.length
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
  for (const slug of selectedSlugs.value) params.append('slugs', slug)

  const data = await $fetch<UpdatesResponse>(`/api/member/updates?${params.toString()}`)
  memberCohorts.value = data.memberCohorts ?? []
  companies.value = data.companies ?? []
  total.value = data.total
  hasMore.value = data.hasMore
  updates.value = reset ? data.updates : [...updates.value, ...data.updates]
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    await fetchPage(false)
  } finally {
    loadingMore.value = false
  }
}

// Initial load once auth is confirmed.
watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    await fetchPage(true)
    loading.value = false
    $posthog?.capture?.('investor_updates_viewed', {
      company_count: companies.value.length,
      total_updates: total.value,
    })
  }
})

// Reload from the top whenever the company filter changes (after the first load).
watch(
  selectedSlugs,
  async () => {
    if (loading.value) return
    loading.value = true
    try {
      await fetchPage(true)
    } finally {
      loading.value = false
    }
    $posthog?.capture?.('investor_updates_filtered', {
      slugs: selectedSlugs.value.length ? selectedSlugs.value.join(',') : 'all',
      company_count: selectedSlugs.value.length,
    })
  },
  { deep: true },
)

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feed-card-link {
  text-decoration: none;
}

.feed-card {
  background: #161616 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  padding: 18px;
  transition: border-color 0.15s ease;
}

.feed-card:hover {
  border-color: rgba(255, 255, 255, 0.3) !important;
}

.company-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.latest-title {
  color: #ddd;
  font-size: 14px;
  font-weight: 500;
}

.latest-headline {
  color: #aaa;
  font-size: 13px;
  line-height: 1.45;
}

.meta {
  color: #888;
  font-size: 12px;
}
</style>
