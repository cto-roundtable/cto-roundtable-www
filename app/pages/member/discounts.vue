<template>
  <div class="discounts text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Fordeler</h1>
      <p style="color: #aaa; font-size: 14px;">
        Rabatter og tilbud medlemmer gir hverandre på sine produkter.
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="!offers.length" style="color: #aaa;">
      Ingen tilbud er publisert ennå.
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

        <p class="offer-terms mb-3">{{ offer.terms || '—' }}</p>

        <!-- Active: show the code to redeem -->
        <div v-if="offer.status === 'active' && offer.code" class="mb-3">
          <button class="code-pill" @click="copyCode(offer.code)">
            <v-icon size="14" class="mr-1">mdi-content-copy</v-icon>
            <span>{{ copiedCode === offer.code ? 'Kopiert!' : offer.code }}</span>
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
            Jeg ønsker denne
          </v-btn>
          <v-btn
            v-else
            size="small"
            variant="outlined"
            color="white"
            :loading="busy === offer.id"
            @click="unrequest(offer)"
          >
            ✓ Du har meldt interesse (angre)
          </v-btn>
          <span class="signal ml-3">{{ offer.requestCount }} medlemmer ønsker dette</span>
        </div>

        <!-- Board-only signal on pending offers -->
        <div v-if="isBoard && offer.status === 'pending'" class="mb-3">
          <span class="signal">{{ offer.requestCount }} forespørsler · kun synlig for styret</span>
        </div>

        <p v-if="offer.contactName" class="offer-contact mb-0">
          Tilbys av {{ offer.contactName }}
        </p>

        <p v-if="isBoard && offer.notes" class="offer-notes mt-2 mb-0">
          {{ offer.notes }}
        </p>
      </v-card>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

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

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    const data = await $fetch<{ isBoard: boolean; offers: Offer[] }>('/api/member/discounts')
    isBoard.value = data.isBoard
    offers.value = data.offers
    loading.value = false
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
  } finally {
    busy.value = null
  }
}

async function copyCode(code: string | null) {
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = code
    setTimeout(() => {
      if (copiedCode.value === code) copiedCode.value = null
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
  const labels: Record<string, string> = {
    active: 'Aktiv',
    testing: 'Til testing',
    pending: 'Under vurdering',
  }
  return labels[status] || status
}
</script>

<style scoped>
.offer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.offer-card {
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
  color: #777;
  font-size: 12px;
  font-style: italic;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
}
</style>
