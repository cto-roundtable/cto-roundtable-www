<template>
  <div class="noes text-left">
    <NuxtLink to="/member/caser" class="back">
      <v-icon size="16" aria-hidden="true">mdi-chevron-left</v-icon>{{ t('deals.list.title') }}
    </NuxtLink>
    <header class="page-head">
      <h1 class="page-title">{{ t('deals.overview.declined') }}</h1>
      <p class="intro">{{ t('deals.noes.intro') }}</p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <p v-else-if="!rows" class="empty">{{ t('deals.noes.notForYou') }}</p>

    <template v-else>
      <div class="tools">
        <label class="search">
          <v-icon size="18" class="search-icon" aria-hidden="true">mdi-magnify</v-icon>
          <span class="sr-only">{{ t('deals.noes.searchLabel') }}</span>
          <input v-model="q" type="search" class="search-input" :placeholder="t('deals.noes.searchPlaceholder')" />
        </label>
        <label class="year">
          <span>{{ t('deals.noes.yearLabel') }}</span>
          <select v-model="year" class="select">
            <option value="">{{ t('deals.noes.allYears') }}</option>
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
      </div>
      <div class="chips" role="group" :aria-label="t('deals.noes.categoryLabel')">
        <button type="button" class="chip" :aria-pressed="category === ''" @click="category = ''">
          {{ t('deals.noes.allCategories') }} <span class="chip-count">{{ rows.length }}</span>
        </button>
        <button
          v-for="c in categories"
          :key="c.key"
          type="button"
          class="chip"
          :class="{ 'chip-ticket': c.key === 'ticket_size' }"
          :aria-pressed="category === c.key"
          @click="category = category === c.key ? '' : c.key"
        >
          <v-icon v-if="c.key === 'ticket_size'" size="14" aria-hidden="true">mdi-cash-multiple</v-icon>
          {{ t(`deals.noes.category.${c.key}`) }} <span class="chip-count">{{ c.count }}</span>
        </button>
      </div>

      <p class="shown" role="status">{{ t('deals.noes.shown', { shown: shown.length, total: rows.length }) }}</p>
      <div v-if="shown.length" class="rows">
        <DealsNoRow v-for="c in shown" :key="`${c.name}-${c.decidedOn}`" :c="c" />
      </div>
      <p v-else class="empty">{{ t(rows.length ? 'deals.noes.noMatch' : 'deals.overview.declinedEmpty') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
// Every no (Snorre 2026-11-11): the companies we said no to and the ones that said no to
// us, newest first, with why it ended. Searchable by name and reason, filtered by year and
// category; a ticket-size no is marked so it stands out. The same people as the
// overview's "Sagt nei til" (the SPV investing now). A row links only when its case opens.
import { categoryCounts, filterNoes, type NoRow, yearsOf } from '~/utils/noList'

definePageMeta({ layout: 'member' })

const { t } = useI18n()
const { session, checked } = useAuthSession()
const { $posthog } = useNuxtApp()
const loading = ref(true)
const rows = ref<NoRow[] | null>(null)
const q = ref('')
const year = ref('')
const category = ref('')

watch(
  () => checked.value && session.value.authenticated,
  async (ready) => {
    if (!ready) return
    loading.value = true
    try {
      const res = await $fetch<{ audience: string[]; rows: NoRow[] | null }>('/api/member/deals/declined')
      rows.value = res.rows
      $posthog?.capture?.('deal_noes_viewed', { rows: res.rows?.length ?? null })
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const years = computed(() => yearsOf(rows.value ?? []))
const categories = computed(() => categoryCounts(rows.value ?? []))
const shown = computed(() => filterNoes(rows.value ?? [], { q: q.value, year: year.value, category: category.value }))
</script>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: #aaa;
  font-size: 13px;
  text-decoration: none;
  margin-bottom: 12px;
  min-height: 32px;
}
.back:hover,
.back:focus-visible {
  color: #fff;
}
.page-head {
  margin-bottom: 24px;
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
.tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin: 0 0 12px;
}
.search {
  position: relative;
  flex: 1 1 260px;
  max-width: 420px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #888;
}
.search-input {
  width: 100%;
  color: #fff;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 8px 12px 8px 34px;
  min-height: 40px;
  font-size: 14px;
}
.search-input:focus-visible,
.select:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 2px;
}
.year {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #aaa;
  font-size: 13px;
}
.select {
  color: #fff;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 5px 28px 5px 10px;
  min-height: 40px;
  font-size: 13px;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #aaa 50%), linear-gradient(135deg, #aaa 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 4px 12px;
  min-height: 32px;
}
.chip:hover,
.chip:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.chip[aria-pressed='true'] {
  background: #fff;
  border-color: #fff;
  color: #111;
}
.chip-ticket {
  border-color: #ffb74d;
  color: #ffb74d;
}
.chip-ticket[aria-pressed='true'] {
  background: #ffb74d;
  border-color: #ffb74d;
  color: #111;
}
.chip-count {
  font-size: 12px;
  opacity: 0.75;
}
.shown {
  color: #999;
  font-size: 13px;
  margin: 0 0 8px;
}
.rows {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
}
.empty {
  color: #aaa;
  font-size: 14px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
