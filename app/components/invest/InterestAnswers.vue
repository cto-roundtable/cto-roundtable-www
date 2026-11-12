<template>
  <section id="invest-answers" class="mb-10">
    <h2 class="section-title">{{ t('invest.committee.answers.heading', { n: rows.length }) }}</h2>

    <!-- The totals: the same numbers as `invest-offering.mjs show` -->
    <div class="totals mb-4">
      <div class="total">
        <p class="total-label">{{ t('invest.committee.answers.totalYes') }}</p>
        <p class="total-value">{{ totals.yes }}</p>
        <p class="total-sub">{{ nok(totals.yesNok) }}</p>
      </div>
      <div class="total">
        <p class="total-label">{{ t('invest.committee.answers.totalMaybe') }}</p>
        <p class="total-value">{{ totals.maybe }}</p>
      </div>
      <div class="total">
        <p class="total-label">{{ t('invest.committee.answers.totalNo') }}</p>
        <p class="total-value">{{ totals.no }}</p>
      </div>
    </div>

    <p v-if="!rows.length" class="muted">{{ t('invest.committee.answers.empty') }}</p>

    <!-- Wide screens: a table (scrolls sideways if it must). Phones: a card each. -->
    <div v-else-if="!smAndDown" class="table-wrap">
      <v-table density="comfortable" class="committee-table">
        <thead>
          <tr>
            <th>{{ t('invest.committee.answers.col.name') }}</th>
            <th>{{ t('invest.committee.answers.col.answer') }}</th>
            <th class="text-right">{{ t('invest.committee.answers.col.amount') }}</th>
            <th>{{ t('invest.committee.answers.col.vehicle') }}</th>
            <th v-if="showWantsInfo">{{ t('invest.committee.answers.col.wantsInfo') }}</th>
            <th>{{ t('invest.committee.answers.col.wantsToHelp') }}</th>
            <th>{{ t('invest.committee.answers.col.notes') }}</th>
            <th>{{ t('invest.committee.answers.col.updatedAt') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="`${r.name}-${i}`" class="answer-row">
            <td class="font-weight-bold">{{ r.name }}</td>
            <td>
              <v-chip size="small" variant="outlined" :color="r.answer === 'yes' || r.answer === 'committed' ? 'success' : undefined">
                {{ t(`invest.committee.answer.${r.answer ?? 'none'}`) }}
              </v-chip>
            </td>
            <td class="text-right nowrap">{{ nok(r.amountNok) }}</td>
            <td>{{ vehicle(r) }}</td>
            <td v-if="showWantsInfo">{{ r.wantsInfo ? t('invest.committee.answers.wantsInfoYes') : '' }}</td>
            <td class="text">{{ r.wantsToHelp ?? '' }}</td>
            <td class="text">{{ r.notes ?? '' }}</td>
            <td class="nowrap">{{ formatDate(r.updatedAt, 'short') }}</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <ul v-else class="cards">
      <li v-for="(r, i) in rows" :key="`${r.name}-${i}`" class="answer-row">
        <div class="d-flex flex-wrap align-center" style="gap: 6px 10px;">
          <span class="font-weight-bold" style="color: #fff;">{{ r.name }}</span>
          <v-chip size="small" variant="outlined" :color="r.answer === 'yes' || r.answer === 'committed' ? 'success' : undefined">
            {{ t(`invest.committee.answer.${r.answer ?? 'none'}`) }}
          </v-chip>
          <span v-if="r.amountNok" class="amount">{{ nok(r.amountNok) }}</span>
        </div>
        <p v-if="vehicle(r)" class="line mb-0">{{ vehicle(r) }}</p>
        <p v-if="showWantsInfo && r.wantsInfo" class="line mb-0">{{ t('invest.committee.answers.col.wantsInfo') }}</p>
        <p v-if="r.wantsToHelp" class="line mb-0">{{ t('invest.committee.answers.helpLine', { text: r.wantsToHelp }) }}</p>
        <p v-if="r.notes" class="text mb-0">«{{ r.notes }}»</p>
        <p class="muted mb-0">{{ t('invest.committee.answers.updatedLine', { date: formatDate(r.updatedAt) }) }}</p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// Every member's answer to the offering, for the committee (current-komite only: the API
// gives it to nobody else), with the totals on top. "Vil vite mer" (wants_info) is no
// longer asked in the form (2026-11-12), so its column shows only while some row has it.
import { useDisplay } from 'vuetify'

interface InterestAnswerRow {
  name: string
  answer: 'yes' | 'maybe' | 'no' | 'committed' | null
  amountNok: number | null
  vehicle: 'holding' | 'personal' | 'unsure' | null
  holding: string | null
  wantsInfo: boolean | null
  wantsToHelp: string | null
  notes: string | null
  updatedAt: string
}

const props = defineProps<{
  rows: InterestAnswerRow[]
  totals: { yes: number; yesNok: number; maybe: number; no: number }
}>()
const { t } = useI18n()
const { tag, formatDate } = useLocaleDate()
const { smAndDown } = useDisplay()

const showWantsInfo = computed(() => props.rows.some((r) => r.wantsInfo))

function nok(value: number | null): string {
  if (value === null) return ''
  return new Intl.NumberFormat(tag.value, { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(
    value,
  )
}

function vehicle(r: InterestAnswerRow): string {
  if (r.vehicle === 'holding' && r.holding) return t('invest.form.vehicle.holdingNamed', { holding: r.holding })
  return r.vehicle ? t(`invest.form.vehicle.${r.vehicle}`) : ''
}
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
.totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-width: 560px;
}
.total {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 10px 14px;
}
.total p {
  margin: 0;
}
.total-label {
  color: #aaa;
  font-size: 13px;
}
.total-value {
  color: #fff;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.total-sub {
  color: #ccc;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.table-wrap {
  overflow-x: auto;
}
/* The portal's Vuetify theme is light; dark tables set their own colours (as on /member). */
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
.committee-table :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.05) !important;
}
.nowrap {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.text {
  color: #ccc;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 140px;
}
.cards {
  list-style: none;
  padding: 0;
  margin: 0;
}
li.answer-row {
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.amount {
  color: #fff;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.line {
  color: #ccc;
  font-size: 14px;
}
</style>
