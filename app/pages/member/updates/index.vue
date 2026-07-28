<template>
  <div class="updates text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Investoroppdateringer</h1>
      <p style="color: #aaa; font-size: 14px;">
        Oppdateringer fra porteføljeselskapene i kohortene du er med i.
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="!companies.length" style="color: #aaa;">
      Ingen oppdateringer er lagt inn ennå.
    </div>

    <section v-else class="company-grid">
      <NuxtLink
        v-for="c in companies"
        :key="c.slug"
        :to="`/member/updates/${c.slug}`"
        class="company-card-link"
      >
        <v-card class="company-card" variant="outlined">
          <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px;">
            <span class="company-name">{{ c.company }}</span>
            <v-chip
              v-for="cohort in c.cohorts"
              :key="cohort"
              color="#2196f3"
              variant="flat"
              size="x-small"
              class="text-uppercase font-weight-bold"
              style="letter-spacing: 0.05em;"
            >
              {{ cohort }}
            </v-chip>
          </div>

          <p class="latest-title mb-1">{{ c.latest.title }}</p>
          <p v-if="c.latest.headline" class="latest-headline mb-2">{{ c.latest.headline }}</p>

          <div class="d-flex align-center justify-space-between">
            <span class="meta">{{ formatDate(c.latest.updateDate) }}</span>
            <span class="meta">{{ c.count }} {{ c.count === 1 ? 'oppdatering' : 'oppdateringer' }}</span>
          </div>
        </v-card>
      </NuxtLink>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

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

interface Company {
  slug: string
  company: string
  cohorts: string[]
  count: number
  latest: UpdateRow
}

const { session, checked } = useAuthSession()
const loading = ref(true)
const companies = ref<Company[]>([])
const { $posthog } = useNuxtApp()

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    const data = await $fetch<{ updates: UpdateRow[] }>('/api/member/updates')

    // Group by company; rows arrive newest-first, so the first per slug is latest.
    const bySlug = new Map<string, Company>()
    for (const u of data.updates) {
      const existing = bySlug.get(u.slug)
      if (existing) {
        existing.count += 1
      } else {
        bySlug.set(u.slug, {
          slug: u.slug,
          company: u.company,
          cohorts: u.cohorts,
          count: 1,
          latest: u,
        })
      }
    }
    companies.value = [...bySlug.values()]
    loading.value = false
    $posthog?.capture?.('investor_updates_viewed', { company_count: companies.value.length })
  }
})

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.company-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.company-card-link {
  text-decoration: none;
}

.company-card {
  background: #161616 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  padding: 18px;
  height: 100%;
  transition: border-color 0.15s ease;
}

.company-card:hover {
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
