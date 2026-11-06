<template>
  <!-- A pensjonist asks the board to become active again (server/utils/rejoin.ts). -->
  <section v-if="state?.canApply" class="mb-8">
    <h2 class="section-title">{{ t('member.rejoin.heading') }}</h2>

    <v-card variant="outlined" class="pa-4">
      <div v-if="state.pending" class="d-flex align-start" style="gap: 10px;">
        <v-icon color="green" size="20" class="mt-1">mdi-check-circle</v-icon>
        <div>
          <p class="font-weight-bold mb-1">{{ t('member.rejoin.pendingTitle') }}</p>
          <p class="mb-0 rejoin-text">
            {{ t('member.rejoin.pendingBody', { date: formatDate(state.pending.createdAt) }) }}
          </p>
        </div>
      </div>

      <form v-else @submit.prevent="apply">
        <p class="mb-4 rejoin-text">{{ t('member.rejoin.intro') }}</p>
        <v-textarea
          v-model="why"
          :label="t('member.rejoin.label')"
          :placeholder="t('member.rejoin.placeholder')"
          :counter="REJOIN_MAX"
          :maxlength="REJOIN_MAX"
          rows="4"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-3"
        />
        <v-btn
          type="submit"
          :loading="sending"
          :disabled="why.trim().length < REJOIN_MIN"
          size="large"
          block
          style="background-color: white; color: #111;"
        >
          {{ t('member.rejoin.submit') }}
        </v-btn>
        <p v-if="why.trim().length < REJOIN_MIN" class="mt-2 mb-0 rejoin-hint">
          {{ t('member.rejoin.minHint', { n: REJOIN_MIN }) }}
        </p>
        <v-alert v-if="error" type="warning" variant="outlined" class="mt-3 text-left" role="alert">
          {{ t('member.rejoin.error') }}
        </v-alert>
      </form>
    </v-card>
  </section>
</template>

<script setup lang="ts">
// The same limits as server/utils/rejoin.ts (REJOIN_MIN, REJOIN_MAX); the server enforces them.
const REJOIN_MIN = 20
const REJOIN_MAX = 2000

const { t } = useI18n()
const { formatDate } = useLocaleDate()

const state = ref<{ canApply: boolean; pending: { id: string; createdAt: string } | null } | null>(null)
const why = ref('')
const sending = ref(false)
const error = ref(false)

onMounted(async () => {
  state.value = await $fetch('/api/member/rejoin').catch(() => null)
})

async function apply() {
  sending.value = true
  error.value = false
  try {
    const res = await $fetch<{ pending: { id: string; createdAt: string } }>('/api/member/rejoin', {
      method: 'POST',
      body: { why: why.value },
    })
    state.value = { canApply: true, pending: res.pending }
  } catch (err: any) {
    // Already open (another tab, a double click): show it rather than an error.
    if (err?.data?.data?.code === 'pending') state.value = await $fetch('/api/member/rejoin').catch(() => state.value)
    else error.value = true
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.rejoin-text {
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;
  max-width: 64ch;
}
.rejoin-hint {
  color: #999;
  font-size: 13px;
}
</style>
