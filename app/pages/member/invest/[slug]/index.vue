<template>
  <div class="invest-page text-left">
    <div v-if="loading" class="text-center py-8"><v-progress-circular indeterminate color="white" /></div>

    <v-alert v-else-if="loadError" type="warning" variant="outlined">{{ t('invest.notFound') }}</v-alert>

    <template v-else-if="data">
      <header class="mb-6">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ data.offering.name }}</h1>
        <p class="intro">{{ t('invest.intro') }}</p>
      </header>

      <v-alert v-if="data.preview" type="info" variant="outlined" class="mb-6 text-left">
        {{ t('invest.preview') }}
      </v-alert>

      <!-- The deck and any other documents, behind login -->
      <section v-if="data.documents.length" class="mb-8">
        <NuxtLink
          v-for="d in data.documents"
          :key="d.key"
          :to="`/member/invest/${data.offering.slug}/dokument/${d.key}`"
          class="doc-card mb-3"
        >
          <v-icon color="white" size="22">{{ d.key === 'deck' ? 'mdi-presentation' : 'mdi-file-document-outline' }}</v-icon>
          <div class="flex-grow-1">
            <p class="font-weight-bold mb-0" style="color: #fff;">{{ d.title }}</p>
            <p class="mb-0" style="color: #aaa; font-size: 13px;">
              {{ t('invest.documents.updated', { date: formatDate(d.publishedAt) }) }}
              <span v-if="d.unanswered" class="unanswered">· {{ t('invest.documents.unanswered', { n: d.unanswered }) }}</span>
            </p>
          </div>
          <span class="doc-card-cta">{{ d.key === 'deck' ? t('invest.documents.openDeck') : t('invest.documents.open') }}</span>
        </NuxtLink>
      </section>

      <section class="mb-8">
        <h2 class="section-title">{{ t('invest.facts.heading') }}</h2>
        <ul class="facts">
          <li v-if="data.offering.minNok">{{ t('invest.facts.minimum', { name: data.offering.name, amount: nok(data.offering.minNok) }) }}</li>
          <li>{{ t('invest.facts.notBinding') }}</li>
          <li v-if="data.offering.interestClosesAt">
            {{ t('invest.facts.closes', { date: formatDate(data.offering.interestClosesAt) }) }}
          </li>
        </ul>
        <p v-if="data.lastTime" class="last-time">
          {{
            data.lastTime.holding
              ? t('invest.lastTime.viaHolding', { offering: data.lastTime.offering, amount: nok(data.lastTime.amountNok), holding: data.lastTime.holding })
              : t('invest.lastTime.personal', { offering: data.lastTime.offering, amount: nok(data.lastTime.amountNok) })
          }}
        </p>
        <p v-if="data.aggregate" class="last-time">
          {{ t('invest.aggregate', { yes: data.aggregate.yes, amount: nok(data.aggregate.yesNok), maybe: data.aggregate.maybe }) }}
        </p>
      </section>

      <!-- The member's answer -->
      <section class="mb-8">
        <h2 class="section-title">{{ t('invest.form.heading') }}</h2>

        <!-- The cheer: a saved yes gets the full success state, a maybe a softer one. -->
        <v-alert
          v-if="cheer && !locked && canAnswer"
          id="invest-cheer"
          type="success"
          :variant="cheer.strong ? 'tonal' : 'outlined'"
          :icon="cheer.strong ? 'mdi-party-popper' : 'mdi-check-circle-outline'"
          class="text-left mb-4"
        >
          <p class="font-weight-bold mb-1">{{ cheer.title }}</p>
          <p class="mb-0">{{ cheer.text }}</p>
        </v-alert>

        <v-alert v-if="locked" type="info" variant="outlined" class="text-left">{{ t('invest.form.locked') }}</v-alert>
        <v-alert v-else-if="!canAnswer" type="info" variant="outlined" class="text-left">{{ t('invest.form.closed') }}</v-alert>

        <v-card v-else variant="outlined" class="pa-4">
          <form @submit.prevent="save">
            <p class="field-label">{{ t('invest.form.answerLabel') }}</p>
            <div class="d-flex flex-wrap mb-5" style="gap: 8px;">
              <v-btn
                v-for="a in answers"
                :key="a.value"
                :variant="form.answer === a.value ? 'flat' : 'outlined'"
                :style="form.answer === a.value ? 'background: #fff; color: #111;' : ''"
                class="text-none"
                @click="form.answer = a.value"
              >
                {{ a.label }}
              </v-btn>
            </div>

            <template v-if="form.answer === 'yes' || form.answer === 'maybe'">
              <p class="field-label">
                {{ form.answer === 'yes' ? t('invest.form.amountLabel') : t('invest.form.amountLabelMaybe') }}
              </p>
              <div class="d-flex flex-wrap mb-2" style="gap: 8px;">
                <v-btn
                  v-for="a in data.offering.amountOptions"
                  :key="a"
                  :variant="!customAmount && form.amountNok === a ? 'flat' : 'outlined'"
                  :style="!customAmount && form.amountNok === a ? 'background: #fff; color: #111;' : ''"
                  class="text-none"
                  @click="pickAmount(a)"
                >
                  {{ nok(a) }}
                </v-btn>
                <v-btn
                  v-if="data.offering.amountStep"
                  :variant="customAmount ? 'flat' : 'outlined'"
                  :style="customAmount ? 'background: #fff; color: #111;' : ''"
                  class="text-none"
                  @click="customAmount = true"
                >
                  {{ t('invest.form.otherAmount') }}
                </v-btn>
              </div>
              <v-text-field
                v-if="customAmount"
                v-model.number="form.amountNok"
                type="number"
                :label="t('invest.form.otherAmountLabel')"
                :hint="t('invest.form.otherAmountHint', { min: nok(data.offering.amountMin ?? data.offering.amountStep), step: nok(data.offering.amountStep) })"
                persistent-hint
                variant="outlined"
                density="comfortable"
                suffix="NOK"
                class="mb-2"
                style="max-width: 320px;"
              />

              <p class="field-label mt-4">{{ t('invest.form.vehicleLabel') }}</p>
              <v-radio-group v-model="form.vehicle" hide-details class="mb-4">
                <v-radio value="holding" :label="holdingLabel" />
                <v-radio value="personal" :label="t('invest.form.vehicle.personal')" />
                <v-radio value="unsure" :label="t('invest.form.vehicle.unsure')" />
              </v-radio-group>

              <v-checkbox
                v-if="form.answer === 'yes'"
                v-model="form.wantsInfo"
                :label="t('invest.form.wantsInfo')"
                hide-details
                density="comfortable"
                class="mb-2"
              />
              <v-text-field
                v-model="form.wantsToHelp"
                :label="t('invest.form.wantsToHelp')"
                :placeholder="t('invest.form.wantsToHelpPlaceholder')"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                class="mb-3"
              />
            </template>

            <v-textarea
              v-if="form.answer"
              v-model="form.notes"
              :label="t('invest.form.notes')"
              rows="2"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              class="mb-3"
            />

            <v-btn
              type="submit"
              :loading="saving"
              :disabled="!form.answer"
              size="large"
              block
              style="background-color: white; color: #111;"
            >
              {{ data.mine ? t('invest.form.update') : t('invest.form.submit') }}
            </v-btn>
            <v-alert v-if="saveError" type="warning" variant="outlined" class="mt-3 text-left">{{ saveError }}</v-alert>
          </form>

          <p v-if="data.mine" class="mt-3 mb-0" style="color: #888; font-size: 13px;">
            {{ t('invest.form.saved', { date: formatDate(data.mine.updatedAt) }) }}
          </p>
        </v-card>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// CTORI interest (signup step 3): "are you in, and roughly how much". Not binding.
// Everything on the page comes from GET /api/member/invest/:slug, and the answer goes
// to POST .../interest; amounts are validated there against the offering's own rule.
definePageMeta({ layout: 'member' })

type Answer = 'yes' | 'maybe' | 'no'
type Vehicle = 'holding' | 'personal' | 'unsure'

interface InvestPage {
  offering: {
    slug: string
    name: string
    status: string
    amountOptions: number[]
    amountMin: number | null
    amountStep: number | null
    minNok: number | null
    interestClosesAt: string | null
  }
  preview: boolean
  mine: {
    answer: Answer | null
    phase: string
    amountNok: number | null
    vehicle: Vehicle | null
    wantsInfo: boolean | null
    wantsToHelp: string | null
    notes: string | null
    updatedAt: string
  } | null
  lastTime: { offering: string; amountNok: number | null; vehicle: Vehicle; holding: string | null } | null
  holdings: string[]
  aggregate: { yes: number; maybe: number; yesNok: number } | null
  // unanswered: comments waiting on the committee (committee only)
  documents: { key: string; title: string; version: number; publishedAt: string; unanswered?: number }[]
}

const { t, te } = useI18n()
const { tag, formatDate } = useLocaleDate()
const route = useRoute()
const { session, checked } = useAuthSession()

const data = ref<InvestPage | null>(null)
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref('')
const customAmount = ref(false)
const form = ref<{
  answer: Answer | null
  amountNok: number | null
  vehicle: Vehicle | null
  wantsInfo: boolean
  wantsToHelp: string
  notes: string
}>({ answer: null, amountNok: null, vehicle: null, wantsInfo: false, wantsToHelp: '', notes: '' })

const answers = computed(() => [
  { value: 'yes' as const, label: t('invest.form.answer.yes') },
  { value: 'maybe' as const, label: t('invest.form.answer.maybe') },
  { value: 'no' as const, label: t('invest.form.answer.no') },
])

// A row that has moved past interest (committed, signed, paid) is not edited here.
const locked = computed(() => Boolean(data.value?.mine && !['interest', 'declined'].includes(data.value.mine.phase)))
const canAnswer = computed(() => data.value?.offering.status === 'interest' || Boolean(data.value?.preview))

const holdingLabel = computed(() => {
  const holdings = data.value?.holdings ?? []
  return holdings.length === 1
    ? t('invest.form.vehicle.holdingNamed', { holding: holdings[0] })
    : t('invest.form.vehicle.holding')
})

// What the saved answer amounts to, said back to the member (not the form's unsaved state).
const cheer = computed(() => {
  const mine = data.value?.mine
  if (!mine || (mine.answer !== 'yes' && mine.answer !== 'maybe')) return null
  const holdings = data.value?.holdings ?? []
  const amount = mine.amountNok ? nok(mine.amountNok) : ''
  let how = ''
  if (amount && mine.answer === 'yes') {
    if (mine.vehicle === 'holding' && holdings.length === 1) {
      how = t('invest.cheer.viaHolding', { amount, holding: holdings[0] })
    } else if (mine.vehicle === 'personal') {
      how = t('invest.cheer.personal', { amount })
    } else {
      how = t('invest.cheer.amountOnly', { amount })
    }
  } else if (amount) {
    how = t('invest.cheer.maybeAmount', { amount })
  }
  const parts =
    mine.answer === 'yes'
      ? [how, t('invest.cheer.canChange')]
      : [how, t('invest.cheer.maybeInfo'), t('invest.cheer.canChange')]
  return {
    strong: mine.answer === 'yes',
    title: mine.answer === 'yes' ? t('invest.cheer.yesTitle') : t('invest.cheer.maybeTitle'),
    text: parts.filter(Boolean).join(' '),
  }
})

function nok(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return new Intl.NumberFormat(tag.value, { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(
    value,
  )
}

function pickAmount(amount: number) {
  customAmount.value = false
  form.value.amountNok = amount
}

function prefill(page: InvestPage) {
  const mine = page.mine
  if (mine) {
    form.value = {
      answer: mine.answer,
      amountNok: mine.amountNok,
      vehicle: mine.vehicle,
      wantsInfo: Boolean(mine.wantsInfo),
      wantsToHelp: mine.wantsToHelp ?? '',
      notes: mine.notes ?? '',
    }
    customAmount.value = mine.amountNok !== null && !page.offering.amountOptions.includes(mine.amountNok)
    return
  }
  // Nothing answered yet: start from what we know (last time's vehicle, an owned holding).
  if (page.lastTime) form.value.vehicle = page.lastTime.vehicle
  else if (page.holdings.length) form.value.vehicle = 'holding'
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    data.value = await $fetch<InvestPage>(`/api/member/invest/${route.params.slug}`)
    prefill(data.value)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!data.value || !form.value.answer) return
  saving.value = true
  saveError.value = ''
  try {
    const result = await $fetch<{ mine: InvestPage['mine'] }>(
      `/api/member/invest/${data.value.offering.slug}/interest`,
      {
        method: 'POST',
        body: { ...form.value, amountNok: form.value.answer === 'no' ? null : form.value.amountNok },
      },
    )
    data.value.mine = result.mine
    // The button is at the bottom of a long form, the cheer at the top: bring it into view.
    if (cheer.value) {
      await nextTick()
      document.getElementById('invest-cheer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  } catch (err: any) {
    const key = err?.data?.message
    saveError.value = key && te(key) ? t(key) : t('invest.errors.unknown')
  } finally {
    saving.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated && !data.value && loading.value) load()
})
</script>

<style scoped>
.invest-page {
  line-height: 1.7;
}
.intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
  max-width: 640px;
}
.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}
.field-label {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
}
.facts {
  color: #ccc;
  font-size: 14px;
  padding-left: 18px;
  margin-bottom: 12px;
}
.last-time {
  color: #ccc;
  font-size: 14px;
  margin-bottom: 6px;
}
.doc-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  text-decoration: none;
  transition: border-color 0.15s ease;
}
/* On a phone the button gets its own row, so the title is not squeezed. */
@media (max-width: 599px) {
  .doc-card {
    flex-wrap: wrap;
  }
  .doc-card .flex-grow-1 {
    flex-basis: calc(100% - 40px);
  }
}
.doc-card:hover {
  border-color: rgba(255, 255, 255, 0.6);
}
.unanswered {
  color: #fff;
  font-weight: 600;
}
.doc-card-cta {
  flex-shrink: 0;
  margin-left: auto;
  background: #fff;
  color: #111;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
}
</style>
