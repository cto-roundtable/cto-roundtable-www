<template>
  <div class="board-meetings text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Styremøter</h1>
      <p style="color: #aaa; font-size: 14px;">
        Agendaer og referater for styret i foreningen CTO Roundtable. Kun for styret.
      </p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="error" style="color: #aaa;">
      Fikk ikke hentet styremøtene. Prøv å laste siden på nytt.
    </div>

    <div v-else-if="!meetings.length" style="color: #aaa;">
      Ingen styremøter er lagt inn ennå.
    </div>

    <template v-else>
      <section v-if="upcoming.length" class="mb-8">
        <h2 class="section-title">Kommende</h2>
        <div class="feed">
          <NuxtLink
            v-for="m in upcoming"
            :key="m.slug"
            :to="`/member/board/${m.slug}`"
            class="meeting-link"
          >
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px;">
                <span class="meeting-title">Styremøte nr. {{ m.number }}</span>
                <span v-if="m.hasAgenda" class="tag tag-agenda">Agenda</span>
                <span v-if="m.hasMinutes" class="tag tag-referat">Referat</span>
              </div>
              <p class="meeting-date mb-1">{{ dateLine(m) }}</p>
              <p v-if="m.location" class="meta mb-0">{{ m.location }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="held.length">
        <h2 class="section-title">Tidligere</h2>
        <div class="feed">
          <NuxtLink
            v-for="m in held"
            :key="m.slug"
            :to="`/member/board/${m.slug}`"
            class="meeting-link"
          >
            <div class="feed-card">
              <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px;">
                <span class="meeting-title">Styremøte nr. {{ m.number }}</span>
                <span v-if="m.hasAgenda" class="tag tag-agenda">Agenda</span>
                <span v-if="m.hasMinutes" class="tag tag-referat">Referat</span>
              </div>
              <p class="meeting-date mb-1">{{ dateLine(m) }}</p>
              <p v-if="m.location" class="meta mb-0">{{ m.location }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>
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
  hasAgenda: boolean
  hasMinutes: boolean
}

const { session, checked } = useAuthSession()
const loading = ref(true)
const error = ref(false)
const meetings = ref<Meeting[]>([])

// Anything not explicitly marked 'held' is still ahead of us, so a meeting that
// nobody has written a referat for keeps showing up top instead of vanishing.
const upcoming = computed(() => meetings.value.filter((m) => m.status !== 'held'))
const held = computed(() => meetings.value.filter((m) => m.status === 'held'))

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      const data = await $fetch<{ meetings: Meeting[] }>('/api/member/board/meetings')
      meetings.value = data.meetings ?? []
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }
})

function dateLine(m: Meeting): string {
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
}
</script>

<style scoped>
.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meeting-link {
  display: block;
  text-decoration: none;
}

.feed-card {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #fff;
  padding: 18px;
  transition: border-color 0.15s ease;
}

.feed-card:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.meeting-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.meeting-date {
  color: #ddd;
  font-size: 14px;
}

.meta {
  color: #888;
  font-size: 12px;
}

.tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 3px;
  color: #fff;
}

.tag-agenda {
  background: #2196f3;
}

.tag-referat {
  background: #4caf50;
}
</style>
