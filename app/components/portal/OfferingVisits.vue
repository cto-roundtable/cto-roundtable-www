<template>
  <section id="offering-visits" class="mb-10">
    <h2 class="section-title">{{ t('portalVisits.heading', { n: data?.visitors ?? 0 }) }}</h2>
    <p class="muted mb-3">
      {{ data?.loggingSince ? t('portalVisits.intro', { date: formatDate(data.loggingSince) }) : t('portalVisits.introEmpty') }}
    </p>

    <p v-if="error" class="muted">{{ t('portalVisits.error') }}</p>
    <p v-else-if="data && !data.rows.length" class="muted">{{ t('portalVisits.empty') }}</p>

    <template v-else-if="data">
      <p v-if="data.visitedNotAnswered" class="line mb-3">
        {{ t('portalVisits.notAnswered', data.visitedNotAnswered) }}
      </p>

      <!-- Wide screens: a table. Phones: a card each (as the answers above). -->
      <div v-if="!smAndDown" class="table-wrap">
        <v-table density="comfortable" class="committee-table">
          <thead>
            <tr>
              <th>{{ t('portalVisits.col.name') }}</th>
              <th>{{ t('portalVisits.col.answer') }}</th>
              <th class="text-right">{{ t('portalVisits.col.visits') }}</th>
              <th class="text-right">{{ t('portalVisits.col.documentViews') }}</th>
              <th>{{ t('portalVisits.col.first') }}</th>
              <th>{{ t('portalVisits.col.last') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.rows" :key="r.personId" class="visit-row">
              <td class="font-weight-bold">{{ r.name }}</td>
              <td>
                <v-chip size="small" variant="outlined" :color="r.answer === 'yes' || r.answer === 'committed' ? 'success' : undefined">
                  {{ t(`invest.committee.answer.${r.answer ?? 'none'}`) }}
                </v-chip>
              </td>
              <td class="text-right nowrap">{{ r.visits }}</td>
              <td class="text-right nowrap">{{ r.documentViews }}</td>
              <td class="nowrap">{{ when(r.firstAt) }}</td>
              <td class="nowrap">{{ when(r.lastAt) }}</td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <ul v-else class="cards">
        <li v-for="r in data.rows" :key="r.personId" class="visit-row">
          <div class="d-flex flex-wrap align-center" style="gap: 6px 10px;">
            <span class="font-weight-bold" style="color: #fff;">{{ r.name }}</span>
            <v-chip size="small" variant="outlined" :color="r.answer === 'yes' || r.answer === 'committed' ? 'success' : undefined">
              {{ t(`invest.committee.answer.${r.answer ?? 'none'}`) }}
            </v-chip>
          </div>
          <p class="line mb-0">{{ t('portalVisits.cardLine', { visits: r.visits, documentViews: r.documentViews }) }}</p>
          <p class="muted mb-0">{{ t('portalVisits.cardDates', { first: when(r.firstAt), last: when(r.lastAt) }) }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
// Who opened the offering's pages while signed in to the portal (server/utils/portalVisits.ts),
// for the committee: the API gives it to nobody else. Logged server-side, so members who
// said no to the cookie banner are here too. Its own fetch, so the committee page needs
// only this one line.
import { useDisplay } from 'vuetify'

interface OfferingVisitRow {
  personId: string
  name: string
  visits: number
  documentViews: number
  firstAt: string
  lastAt: string
  answer: 'yes' | 'maybe' | 'no' | 'committed' | null
}

interface OfferingVisits {
  loggingSince: string | null
  visitors: number
  visitedNotAnswered: number
  rows: OfferingVisitRow[]
}

const props = defineProps<{ slug: string }>()
const { t } = useI18n()
const { formatDate, format } = useLocaleDate()
const { smAndDown } = useDisplay()

const data = ref<OfferingVisits | null>(null)
const error = ref(false)

function when(value: string): string {
  return format(value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  try {
    data.value = await $fetch<OfferingVisits>(`/api/member/invest/${encodeURIComponent(props.slug)}/visits`)
  } catch {
    error.value = true
  }
})
</script>

<style scoped>
.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}
.muted {
  color: #888;
  font-size: 13px;
}
.line {
  color: #ccc;
  font-size: 14px;
}
.table-wrap {
  overflow-x: auto;
}
.committee-table {
  background: transparent !important;
  color: #fff !important;
  font-size: 14px;
}
.committee-table :deep(th) {
  color: #aaa !important;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
}
.committee-table :deep(td) {
  color: #fff !important;
  vertical-align: top;
  padding-top: 10px !important;
  padding-bottom: 10px !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
}
.nowrap {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.cards {
  list-style: none;
  padding: 0;
  margin: 0;
}
li.visit-row {
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
