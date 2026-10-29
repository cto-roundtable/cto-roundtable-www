<template>
  <NuxtLink v-if="offering && !offering.answered" :to="`/member/invest/${offering.slug}`" class="invest-banner mb-6">
    <v-icon color="white" size="22">mdi-hand-coin-outline</v-icon>
    <div class="flex-grow-1">
      <p class="font-weight-bold mb-0" style="color: #fff;">
        {{ offering.status === 'draft' ? t('invest.banner.titlePreview', { name: offering.name }) : t('invest.banner.title', { name: offering.name }) }}
      </p>
      <p class="mb-0" style="color: #ccc; font-size: 14px;">{{ t('invest.banner.body') }}</p>
    </div>
    <span class="invest-banner-cta">{{ t('invest.banner.cta') }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
// "CTORI 4: er du med?" on /member and /member/sweden, until the member has answered.
// Self-contained: its own route, so a failure hides the banner and nothing else.
interface CurrentOffering {
  slug: string
  name: string
  status: string
  answered: boolean
}

const { t } = useI18n()
const offering = ref<CurrentOffering | null>(null)

onMounted(async () => {
  try {
    offering.value = (await $fetch<{ offering: CurrentOffering | null }>('/api/member/invest/current')).offering
  } catch {
    offering.value = null
  }
})
</script>

<style scoped>
.invest-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #161616;
  border: 1px solid #4caf50;
  border-radius: 4px;
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.invest-banner:hover {
  border-color: #81c784;
}
.invest-banner-cta {
  flex-shrink: 0;
  background: #4caf50;
  color: #111;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
}
</style>
