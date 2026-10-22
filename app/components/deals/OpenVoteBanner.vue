<template>
  <div v-if="votes.length">
    <NuxtLink v-for="v in votes" :key="v.roundId" :to="`/member/caser/${v.slug}#vote`" class="vote-banner mb-6">
      <v-icon color="white" size="22">mdi-ballot-outline</v-icon>
      <div class="flex-grow-1">
        <p class="font-weight-bold mb-0" style="color: #fff;">{{ t('deals.banner.title', { name: v.name }) }}</p>
        <p class="mb-0" style="color: #ccc; font-size: 14px;">
          {{ t('deals.banner.body', { group: v.group, when: format(v.closesAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }) }}
        </p>
      </div>
      <span class="vote-banner-cta">{{ t('deals.banner.cta') }}</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
// "Open vote: <company>" on /member, for each open round the member may vote in
// and has not. Self-contained: its own route, no shared state with the page.
interface OpenVote {
  roundId: string
  slug: string
  name: string
  group: string
  closesAt: string
}

const { t } = useI18n()
const { format } = useLocaleDate()
const votes = ref<OpenVote[]>([])

onMounted(async () => {
  try {
    votes.value = (await $fetch<{ votes: OpenVote[] }>('/api/member/deals/open-votes')).votes
  } catch {
    votes.value = []
  }
})
</script>

<style scoped>
.vote-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #161616;
  border: 1px solid #ff9800;
  border-radius: 4px;
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.vote-banner:hover {
  border-color: #ffb74d;
}
.vote-banner-cta {
  flex-shrink: 0;
  background: #ff9800;
  color: #111;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
}
</style>
