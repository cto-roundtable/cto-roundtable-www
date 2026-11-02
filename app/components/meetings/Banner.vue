<template>
  <div v-if="meetings.length">
    <NuxtLink v-for="m in meetings" :key="m.id" :to="`/member/arsmote/${m.id}`" class="meeting-banner mb-6" data-test="meeting-banner">
      <v-icon color="white" size="22">mdi-account-group-outline</v-icon>
      <div class="flex-grow-1">
        <p class="font-weight-bold mb-0" style="color: #fff;">
          {{ t(m.status === 'in_session' ? 'meetings.banner.live' : 'meetings.banner.announced', { title: m.title }) }}
        </p>
        <p v-if="m.heldAt" class="mb-0" style="color: #ccc; font-size: 14px;">{{ formatDate(m.heldAt, 'long') }}</p>
      </div>
      <span class="meeting-banner-cta">{{ t('meetings.banner.cta') }}</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
// "Årsmøte: <title>" on /member, for an announced or live general meeting the
// member votes in. Self-contained: its own route, no shared state with the page.
interface MeetingSummary {
  id: string
  title: string
  heldAt: string | null
  status: string
  onRoster: boolean
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const meetings = ref<MeetingSummary[]>([])

onMounted(async () => {
  try {
    const all = (await $fetch<{ meetings: MeetingSummary[] }>('/api/member/meetings')).meetings
    meetings.value = all.filter((m) => m.onRoster && (m.status === 'announced' || m.status === 'in_session'))
  } catch {
    meetings.value = []
  }
})
</script>

<style scoped>
.meeting-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #161616;
  border: 1px solid #7e57c2;
  border-radius: 4px;
  text-decoration: none;
}
.meeting-banner-cta {
  flex-shrink: 0;
  background: #7e57c2;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
}
</style>
