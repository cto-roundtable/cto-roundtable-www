<template>
  <div class="board-meeting text-left">
    <NuxtLink to="/member/board" class="back-link mb-4 d-inline-block">
      &larr; Alle styremøter
    </NuxtLink>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="error" style="color: #aaa;">
      Fant ikke dette styremøtet.
    </div>

    <template v-else-if="meeting">
      <header class="mb-5">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">
          Styremøte nr. {{ meeting.number }}
        </h1>
        <p class="mb-1" style="color: #ddd; font-size: 14px;">{{ dateLine }}</p>
        <p v-if="meeting.location" class="mb-0" style="color: #888; font-size: 13px;">
          {{ meeting.location }}
        </p>
      </header>

      <div v-if="hasBoth" class="tabs mb-4">
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': view === 'agenda' }"
          @click="view = 'agenda'"
        >
          Agenda
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': view === 'referat' }"
          @click="view = 'referat'"
        >
          Referat
        </button>
      </div>

      <BoardMeetingDoc v-if="body" :key="view" :markdown="body" />
      <p v-else style="color: #aaa;">
        {{ view === 'referat' ? 'Referatet er ikke skrevet ennå.' : 'Agendaen er ikke lagt ut ennå.' }}
      </p>

      <BoardProtocolPanel :slug="meeting.slug" :has-minutes="!!meeting.minutesMd" />
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface Meeting {
  slug: string
  number: number
  meetingDate: string
  startsAt: string | null
  endsAt: string | null
  title: string
  location: string | null
  status: string
  agendaMd: string | null
  minutesMd: string | null
}

const route = useRoute()
const { session, checked } = useAuthSession()
const loading = ref(true)
const error = ref(false)
const meeting = ref<Meeting | null>(null)
const view = ref<'agenda' | 'referat'>('agenda')

const hasBoth = computed(() => !!meeting.value?.agendaMd && !!meeting.value?.minutesMd)

const body = computed(() => {
  const m = meeting.value
  if (!m) return ''
  return (view.value === 'referat' ? m.minutesMd : m.agendaMd) ?? ''
})

const dateLine = computed(() => {
  const m = meeting.value
  if (!m) return ''
  const date = new Date(m.meetingDate).toLocaleDateString('nb-NO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  if (!m.startsAt) return date
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  }
  const from = new Date(m.startsAt).toLocaleTimeString('nb-NO', opts)
  const to = m.endsAt ? new Date(m.endsAt).toLocaleTimeString('nb-NO', opts) : null
  return `${date}, kl. ${from}${to ? ` til ${to}` : ''}`
})

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      const data = await $fetch<{ meeting: Meeting }>(`/api/member/board/meetings/${route.params.slug}`)
      meeting.value = data.meeting
      // A held meeting is usually opened for its referat; an upcoming one for
      // its agenda. Fall back to whichever body actually exists.
      if (data.meeting.status === 'held' && data.meeting.minutesMd) view.value = 'referat'
      else if (!data.meeting.agendaMd && data.meeting.minutesMd) view.value = 'referat'
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }
})
</script>

<style scoped>
.back-link {
  color: #888;
  font-size: 13px;
  text-decoration: none;
}

.back-link:hover {
  color: #fff;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 14px;
}

.tab:hover {
  color: #fff;
}

.tab-active {
  border-bottom-color: #fff;
  color: #fff;
}
</style>
