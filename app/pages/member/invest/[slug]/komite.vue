<template>
  <div class="committee-page text-left">
    <div v-if="loading" class="text-center py-8"><v-progress-circular indeterminate color="white" /></div>

    <v-alert v-else-if="loadError" type="warning" variant="outlined">{{ t('invest.notFound') }}</v-alert>

    <template v-else-if="data">
      <NuxtLink :to="`/member/invest/${data.offering.slug}`" class="back mb-3">
        <v-icon size="18">mdi-arrow-left</v-icon>
        {{ t('invest.committee.back', { name: data.offering.name }) }}
      </NuxtLink>
      <header class="mb-6">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">
          {{ t('invest.committee.title', { name: data.offering.name }) }}
        </h1>
        <p class="intro">{{ t('invest.committee.intro') }}</p>
      </header>

      <v-alert v-if="data.preview" type="info" variant="outlined" class="mb-6 text-left">
        {{ t('invest.preview') }}
      </v-alert>

      <InvestSessionSignupList :rows="data.sessionSignups" />
      <InvestInterestAnswers :rows="data.answers" :totals="data.totals" />
    </template>
  </div>
</template>

<script setup lang="ts">
// The committee's page for an offering (current-komite only, Snorre 2026-11-12): who
// wants an online session, and every interest answer with the totals. Everything comes
// from GET /api/member/invest/:slug/komite, which is the 404 for anyone else.
definePageMeta({ layout: 'member' })

interface CommitteePage {
  offering: { slug: string; name: string; status: string }
  preview: boolean
  sessionSignups: {
    name: string
    email: string | null
    signedUpAt: string
    note: string | null
    answer: 'yes' | 'maybe' | 'no' | 'committed' | null
  }[]
  answers: {
    name: string
    answer: 'yes' | 'maybe' | 'no' | 'committed' | null
    amountNok: number | null
    vehicle: 'holding' | 'personal' | 'unsure' | null
    holding: string | null
    wantsInfo: boolean | null
    wantsToHelp: string | null
    notes: string | null
    updatedAt: string
  }[]
  totals: { yes: number; yesNok: number; maybe: number; no: number }
}

const { t } = useI18n()
const route = useRoute()
const { session, checked } = useAuthSession()

const data = ref<CommitteePage | null>(null)
const loading = ref(true)
const loadError = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    data.value = await $fetch<CommitteePage>(`/api/member/invest/${route.params.slug}/komite`)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated && !data.value && loading.value) load()
})
</script>

<style scoped>
.committee-page {
  line-height: 1.6;
}
.intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
  max-width: 640px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #aaa;
  font-size: 14px;
  text-decoration: none;
}
.back:hover {
  color: #fff;
}
</style>
