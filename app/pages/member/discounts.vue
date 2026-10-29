<template>
  <div class="discounts text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.discounts.title') }}</h1>
      <p style="color: #aaa; font-size: 14px;">
        {{ t('member.discounts.intro') }}
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="!offers.length" style="color: #aaa;">
      {{ t('member.discounts.empty') }}
    </div>

    <section v-else class="offer-grid">
      <v-card
        v-for="offer in offers"
        :key="offer.id"
        class="offer-card"
        variant="outlined"
      >
        <div class="d-flex align-center mb-2" style="gap: 10px;">
          <a
            v-if="offer.website"
            :href="offer.website"
            target="_blank"
            rel="noopener"
            class="offer-company"
          >{{ offer.company }}</a>
          <span v-else class="offer-company">{{ offer.company }}</span>

          <v-chip
            :color="statusColor(offer.status)"
            variant="flat"
            size="x-small"
            class="text-uppercase font-weight-bold"
            style="letter-spacing: 0.05em;"
          >
            {{ statusLabel(offer.status) }}
          </v-chip>
        </div>

        <p class="offer-terms clamp mb-3">{{ offer.terms || '—' }}</p>

        <!-- Active: show the code to redeem -->
        <div v-if="offer.status === 'active' && offer.code" class="mb-3">
          <button class="code-pill" @click="copyCode(offer)">
            <v-icon size="14" class="mr-1">mdi-content-copy</v-icon>
            <span>{{ copiedCode === offer.code ? t('common.copied') : offer.code }}</span>
          </button>
        </div>

        <!-- Testing: gather demand signal -->
        <div v-if="offer.status === 'testing'" class="mb-3">
          <v-btn
            v-if="!offer.hasRequested"
            size="small"
            variant="flat"
            :loading="busy === offer.id"
            style="background-color: #fff; color: #111;"
            @click="request(offer)"
          >
            {{ t('member.discounts.request') }}
          </v-btn>
          <v-btn
            v-else
            size="small"
            variant="outlined"
            color="white"
            :loading="busy === offer.id"
            @click="unrequest(offer)"
          >
            {{ t('member.discounts.requested') }}
          </v-btn>
          <span class="signal ml-3">{{ t('member.discounts.demand', offer.requestCount) }}</span>
        </div>

        <!-- Board-only signal on pending offers -->
        <div v-if="isBoard && offer.status === 'pending'" class="mb-3">
          <span class="signal">{{ t('member.discounts.boardRequests', offer.requestCount) }}</span>
        </div>

        <p v-if="offer.contactName" class="offer-contact mb-0">
          {{ t('member.discounts.offeredBy', { name: offer.contactName }) }}
        </p>

        <button class="details-link mt-auto pt-3" @click="openDetails(offer)">
          {{ t('member.discounts.details') }} →
        </button>
      </v-card>
    </section>

    <v-dialog v-model="detailsOpen" max-width="560" scrollable>
      <v-card v-if="selected" class="offer-dialog">
        <v-card-title class="d-flex align-center pt-5 px-6" style="gap: 10px;">
          <span class="offer-company">{{ selected.company }}</span>
          <v-chip
            :color="statusColor(selected.status)"
            variant="flat"
            size="x-small"
            class="text-uppercase font-weight-bold"
            style="letter-spacing: 0.05em;"
          >
            {{ statusLabel(selected.status) }}
          </v-chip>
        </v-card-title>

        <v-card-text class="px-6">
          <p class="offer-terms full mb-4">{{ selected.terms || '—' }}</p>

          <div v-if="selected.status === 'active' && selected.code" class="mb-4">
            <button class="code-pill" @click="copyCode(selected)">
              <v-icon size="14" class="mr-1">mdi-content-copy</v-icon>
              <span>{{ copiedCode === selected.code ? t('common.copied') : selected.code }}</span>
            </button>
          </div>

          <p v-if="selected.contactName" class="offer-contact mb-0">
            {{ t('member.discounts.offeredBy', { name: selected.contactName }) }}
          </p>

          <div v-if="isBoard && selected.notes" class="offer-notes mt-4">
            <div class="notes-label mb-1">{{ t('member.discounts.internalNotes') }}</div>
            {{ selected.notes }}
          </div>
        </v-card-text>

        <v-card-actions class="px-6 pb-5">
          <v-btn
            v-if="selected.redemptionUrl || selected.website"
            :href="selected.redemptionUrl || selected.website || undefined"
            target="_blank"
            rel="noopener"
            size="small"
            variant="flat"
            style="background-color: #fff; color: #111;"
            @click="trackLink(selected)"
          >
            {{ t('member.discounts.visit', { company: selected.company }) }}
          </v-btn>
          <v-spacer />
          <v-btn size="small" variant="text" color="white" @click="detailsOpen = false">
            {{ t('member.discounts.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { t, te } = useI18n()

interface Offer {
  id: string
  company: string
  website: string | null
  title: string
  terms: string | null
  code: string | null
  redemptionUrl: string | null
  status: 'active' | 'testing' | 'pending'
  validUntil: string | null
  contactName: string | null
  requestCount: number
  hasRequested: boolean
  notes: string | null
}

const { session, checked } = useAuthSession()
const loading = ref(true)
const offers = ref<Offer[]>([])
const isBoard = ref(false)
const busy = ref<string | null>(null)
const copiedCode = ref<string | null>(null)
const { $posthog } = useNuxtApp()
const detailsOpen = ref(false)
const selected = ref<Offer | null>(null)

function openDetails(offer: Offer) {
  selected.value = offer
  detailsOpen.value = true
  $posthog?.capture?.('offer_details_opened', { offer_id: offer.id, company: offer.company, status: offer.status })
}

function trackLink(offer: Offer) {
  $posthog?.capture?.('offer_link_clicked', { offer_id: offer.id, company: offer.company })
}

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    const data = await $fetch<{ isBoard: boolean; offers: Offer[] }>('/api/member/discounts')
    isBoard.value = data.isBoard
    offers.value = data.offers
    loading.value = false
    $posthog?.capture?.('fordeler_viewed', {
      offer_count: offers.value.length,
      is_board: isBoard.value,
    })
  }
})

async function request(offer: Offer) {
  busy.value = offer.id
  try {
    const res = await $fetch<{ requestCount: number; hasRequested: boolean }>(
      `/api/member/discounts/${offer.id}/request`,
      { method: 'POST' },
    )
    offer.requestCount = res.requestCount
    offer.hasRequested = res.hasRequested
    $posthog?.capture?.('offer_requested', { offer_id: offer.id, company: offer.company })
  } finally {
    busy.value = null
  }
}

async function unrequest(offer: Offer) {
  busy.value = offer.id
  try {
    const res = await $fetch<{ requestCount: number; hasRequested: boolean }>(
      `/api/member/discounts/${offer.id}/request`,
      { method: 'DELETE' },
    )
    offer.requestCount = res.requestCount
    offer.hasRequested = res.hasRequested
    $posthog?.capture?.('offer_unrequested', { offer_id: offer.id, company: offer.company })
  } finally {
    busy.value = null
  }
}

async function copyCode(offer: Offer) {
  if (!offer.code) return
  try {
    await navigator.clipboard.writeText(offer.code)
    copiedCode.value = offer.code
    $posthog?.capture?.('offer_code_copied', {
      offer_id: offer.id,
      company: offer.company,
      title: offer.title,
    })
    setTimeout(() => {
      if (copiedCode.value === offer.code) copiedCode.value = null
    }, 1500)
  } catch {
    // clipboard not available; ignore
  }
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    active: '#4caf50',
    testing: '#2196f3',
    pending: '#ff9800',
  }
  return colors[status] || '#9e9e9e'
}

function statusLabel(status: string): string {
  const key = `member.discounts.status.${status}`
  return status && te(key) ? t(key) : status
}
</script>

<style scoped>
.offer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.offer-card {
  display: flex;
  flex-direction: column;
  background: #161616 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  padding: 18px;
}

.offer-company {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
}

.offer-company:hover {
  text-decoration: underline;
}

.offer-terms {
  color: #ddd;
  font-size: 14px;
  line-height: 1.5;
}

.offer-terms.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.offer-terms.full {
  white-space: pre-line;
}

.details-link {
  align-self: flex-start;
  background: none;
  border: none;
  color: #bbb;
  font-size: 13px;
  cursor: pointer;
  padding-left: 0;
  padding-right: 0;
}

.details-link:hover {
  color: #fff;
  text-decoration: underline;
}

.offer-dialog {
  background: #161616 !important;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff !important;
}

.code-pill {
  display: inline-flex;
  align-items: center;
  border: 1px dashed rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  padding: 6px 12px;
  font-family: monospace;
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
}

.code-pill:hover {
  background: rgba(255, 255, 255, 0.1);
}

.signal {
  color: #9e9e9e;
  font-size: 13px;
}

.offer-contact {
  color: #888;
  font-size: 13px;
}

.offer-notes {
  color: #888;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-line;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.notes-label {
  color: #aaa;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
