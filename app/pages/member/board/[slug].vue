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

      <div v-if="hasBoth" class="tabs mb-5">
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

      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes first and only emits its own tags -->
      <article v-if="body" class="doc" v-html="body" />
      <p v-else style="color: #aaa;">
        {{ view === 'referat' ? 'Referatet er ikke skrevet ennå.' : 'Agendaen er ikke lagt ut ennå.' }}
      </p>
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
  const md = view.value === 'referat' ? m.minutesMd : m.agendaMd
  return md ? renderMarkdown(md, { headings: 'levels' }) : ''
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

.doc {
  color: #ddd;
  font-size: 14px;
  line-height: 1.7;
}

.doc :deep(h2) {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  margin: 1.8rem 0 0.6rem;
}

.doc :deep(h3) {
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  margin: 1.5rem 0 0.5rem;
}

.doc :deep(h4),
.doc :deep(h5) {
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  margin: 1.2rem 0 0.4rem;
}

.doc :deep(p) {
  margin: 0 0 0.8rem;
}

.doc :deep(ul),
.doc :deep(ol) {
  margin: 0 0 0.9rem;
  padding-left: 1.3rem;
}

.doc :deep(li) {
  margin-bottom: 0.3rem;
}

.doc :deep(a) {
  color: #64b5f6;
}

.doc :deep(strong) {
  color: #fff;
}

.doc :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  font-size: 0.9em;
  padding: 1px 5px;
}

.doc :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 1.6rem 0;
}

.doc :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.25);
  color: #bbb;
  margin: 0 0 1rem;
  padding: 2px 0 2px 14px;
}

.doc :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

/* Tables are the one thing that can outgrow the column on a phone, so they get
   their own scroller rather than pushing the page sideways. */
.doc :deep(.md-table-wrap) {
  margin: 0 0 1.1rem;
  overflow-x: auto;
}

.doc :deep(.md-table) {
  border-collapse: collapse;
  font-size: 13px;
  min-width: 100%;
}

.doc :deep(.md-table th) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-weight: 700;
  padding: 8px 12px 8px 0;
  text-align: left;
  white-space: nowrap;
}

.doc :deep(.md-table td) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  padding: 8px 12px 8px 0;
  vertical-align: top;
}
</style>
