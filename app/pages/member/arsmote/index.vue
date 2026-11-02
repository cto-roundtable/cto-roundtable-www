<template>
  <div class="member-meetings text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('meetings.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">{{ t('meetings.intro') }}</p>
    </header>

    <!-- The board creates a meeting; the API checks styret on its own. -->
    <section v-if="canCreate" class="mb-8">
      <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
        <h2 class="section-title mb-0">{{ t('meetings.create.title') }}</h2>
        <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
          {{ t('common.board') }}
        </v-chip>
      </div>
      <v-btn v-if="!creating" variant="outlined" prepend-icon="mdi-plus" data-test="meeting-new" @click="creating = true">
        {{ t('meetings.create.title') }}
      </v-btn>
      <v-card v-else variant="outlined" class="pa-4" style="max-width: 640px;">
        <v-select
          v-model="form.kind"
          :items="kindItems"
          :label="t('meetings.fields.kind')"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-3"
          data-test="meeting-kind"
        />
        <p class="mb-3" style="color: #aaa; font-size: 13px;">{{ t(`meetings.kindHint.${form.kind}`) }}</p>
        <v-text-field
          v-model="form.title"
          :label="t('meetings.fields.title')"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-3"
          data-test="meeting-title"
        />
        <v-text-field
          v-model="form.heldAt"
          :label="t('meetings.fields.heldAt')"
          type="datetime-local"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-3"
        />
        <v-text-field
          v-model="form.place"
          :label="t('meetings.fields.place')"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          class="mb-4"
        />
        <div class="d-flex flex-wrap" style="gap: 12px;">
          <v-btn :loading="saving" :disabled="!form.title.trim()" style="background-color: white; color: #111;" data-test="meeting-create" @click="create">
            {{ t('meetings.create.submit') }}
          </v-btn>
          <v-btn variant="text" :disabled="saving" @click="creating = false">{{ t('common.cancel') }}</v-btn>
        </div>
        <v-alert v-if="createError" type="warning" variant="outlined" class="mt-3 text-left">{{ createError }}</v-alert>
      </v-card>
    </section>

    <div v-if="loading" class="text-center py-6"><v-progress-circular indeterminate color="white" /></div>
    <div v-else-if="loadError" style="color: #aaa;">{{ loadError }}</div>
    <template v-else>
      <p v-if="meetings.length === 0" style="color: #888; font-size: 15px;">{{ t('meetings.none') }}</p>
      <div v-else class="feed">
        <NuxtLink v-for="m in meetings" :key="m.id" :to="`/member/arsmote/${m.id}`" class="meeting-link">
          <div class="feed-card">
            <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
              <span class="meeting-title">{{ m.title }}</span>
              <span class="tag" :class="`tag-${m.status}`">{{ t(`meetings.status.${m.status}`) }}</span>
              <span v-if="m.kind === 'trial'" class="tag tag-trial">{{ t('meetings.kind.trial') }}</span>
            </div>
            <p class="meta mb-0">
              <span v-if="m.heldAt">{{ formatDate(m.heldAt, 'long') }} · </span>{{ t('meetings.itemCount', m.items) }}
              <span v-if="m.onRoster"> · {{ t('meetings.youVote') }}</span>
            </p>
          </div>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface MeetingSummary {
  id: string
  kind: 'ordinary' | 'extraordinary' | 'trial'
  title: string
  heldAt: string | null
  status: string
  items: number
  onRoster: boolean
}

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()

const meetings = ref<MeetingSummary[]>([])
const canCreate = ref(false)
const loading = ref(true)
const loadError = ref('')
const creating = ref(false)
const saving = ref(false)
const createError = ref('')
const form = ref({ kind: 'ordinary' as MeetingSummary['kind'], title: '', heldAt: '', place: '' })

const kindItems = computed(() =>
  (['ordinary', 'extraordinary', 'trial'] as const).map((k) => ({ value: k, title: t(`meetings.kind.${k}`) })),
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch<{ canCreate: boolean; meetings: MeetingSummary[] }>('/api/member/meetings')
    meetings.value = data.meetings
    canCreate.value = data.canCreate
  } catch {
    loadError.value = t('meetings.errors.load')
  } finally {
    loading.value = false
  }
}

async function create() {
  saving.value = true
  createError.value = ''
  try {
    const res = await $fetch<{ meeting: { id: string } }>('/api/member/meetings', {
      method: 'POST',
      body: {
        kind: form.value.kind,
        title: form.value.title,
        heldAt: form.value.heldAt ? new Date(form.value.heldAt).toISOString() : null,
        place: form.value.place || null,
      },
    })
    await navigateTo(`/member/arsmote/${res.meeting.id}`)
  } catch (err: any) {
    createError.value = err?.data?.message || t('meetings.errors.action')
  } finally {
    saving.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) load()
})
</script>

<style scoped>
.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 12px;
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}
.meeting-link {
  text-decoration: none;
  color: inherit;
}
.feed-card {
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 14px 16px;
  transition: border-color 0.15s ease;
}
.meeting-link:hover .feed-card {
  border-color: #555;
}
.meeting-title {
  font-weight: 600;
  color: #fff;
}
.meta {
  color: #999;
  font-size: 14px;
}
.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  background: #2a2a2a;
  color: #ccc;
}
.tag-in_session {
  background: #ff9800;
  color: #111;
}
.tag-announced {
  background: #1e3a2a;
  color: #a5d6a7;
}
.tag-trial {
  background: #3a2a4a;
  color: #d1c4e9;
}
</style>
