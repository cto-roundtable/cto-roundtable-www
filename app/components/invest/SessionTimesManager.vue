<template>
  <section id="invest-session-times" class="mb-10">
    <h2 class="section-title">{{ t('invest.sessionTimes.manage.heading') }}</h2>
    <p class="intro mb-4">{{ t('invest.sessionTimes.manage.intro') }}</p>

    <!-- The link Snorre pastes in Slack or a mail: straight to the ticks on the offering page -->
    <v-card variant="outlined" class="pa-4 mb-4">
      <p class="field-label">{{ t('invest.sessionTimes.manage.shareLabel') }}</p>
      <div class="d-flex flex-wrap align-center" style="gap: 8px;">
        <code class="share-url flex-grow-1">{{ shareUrl }}</code>
        <v-btn variant="outlined" class="text-none" prepend-icon="mdi-content-copy" @click="copyLink">
          {{ t('invest.sessionTimes.manage.copyLink') }}
        </v-btn>
      </div>
      <p v-if="copied" class="muted mt-2 mb-0">{{ copied }}</p>
    </v-card>

    <p v-if="!times.length" class="muted">{{ t('invest.sessionTimes.manage.empty') }}</p>

    <!-- Each candidate time with who can make it -->
    <ul v-else class="times mb-4">
      <li v-for="tm in times" :key="tm.id" class="time" :class="{ chosen: tm.chosen }">
        <div class="d-flex flex-wrap align-center" style="gap: 6px 10px;">
          <span class="time-date">{{ when(tm).date }}</span>
          <span class="time-range">{{ when(tm).range }}</span>
          <v-chip v-if="tm.chosen" size="small" color="success" variant="flat" prepend-icon="mdi-check">
            {{ t('invest.sessionTimes.manage.chosenChip') }}
          </v-chip>
          <v-chip v-else-if="tm.people.length && tm.people.length === best" size="small" variant="outlined">
            {{ t('invest.sessionTimes.manage.most') }}
          </v-chip>
        </div>
        <p class="count mb-1">{{ t('invest.sessionTimes.manage.canMake', tm.people.length) }}</p>
        <p v-if="tm.people.length" class="people mb-2">{{ tm.people.join(', ') }}</p>
        <p class="link-line mb-2">
          <template v-if="tm.meetingUrl">
            <v-icon size="16">mdi-video</v-icon>
            <a :href="tm.meetingUrl" target="_blank" rel="noopener noreferrer" class="link">{{ tm.meetingUrl }}</a>
          </template>
          <span v-else class="muted">{{ t('invest.sessionTimes.manage.noLink') }}</span>
        </p>

        <!-- Setting or changing the link -->
        <form v-if="editingLink === tm.id" class="d-flex flex-wrap align-start mb-2" style="gap: 8px;" @submit.prevent="saveLink(tm)">
          <v-text-field
            v-model="linkDraft"
            :label="t('invest.sessionTimes.manage.urlLabel')"
            variant="outlined"
            density="compact"
            hide-details
            autofocus
            class="flex-grow-1"
            style="min-width: 220px;"
          />
          <v-btn type="submit" :loading="busy === `link:${tm.id}`" class="text-none" style="background-color: white; color: #111;">
            {{ t('invest.sessionTimes.manage.saveLink') }}
          </v-btn>
          <v-btn variant="text" class="text-none" @click="editingLink = null">{{ t('invest.session.keep') }}</v-btn>
        </form>

        <div v-if="open" class="d-flex flex-wrap" style="gap: 8px;">
          <v-btn
            v-if="!tm.chosen"
            :loading="busy === `choose:${tm.id}`"
            class="text-none"
            style="background-color: white; color: #111;"
            @click="choose(tm, true)"
          >
            {{ t('invest.sessionTimes.manage.choose') }}
          </v-btn>
          <v-btn v-else variant="outlined" :loading="busy === `choose:${tm.id}`" class="text-none" @click="choose(tm, false)">
            {{ t('invest.sessionTimes.manage.unchoose') }}
          </v-btn>
          <v-btn v-if="editingLink !== tm.id" variant="outlined" class="text-none" @click="startLink(tm)">
            {{ tm.meetingUrl ? t('invest.sessionTimes.manage.editLink') : t('invest.sessionTimes.manage.addLink') }}
          </v-btn>
          <v-btn
            variant="text"
            class="text-none"
            :color="confirmRemove === tm.id ? 'warning' : undefined"
            :loading="busy === `remove:${tm.id}`"
            @click="remove(tm)"
          >
            {{ confirmRemove === tm.id ? t('invest.sessionTimes.manage.removeConfirm', tm.people.length) : t('invest.sessionTimes.manage.remove') }}
          </v-btn>
        </div>
      </li>
    </ul>

    <!-- Signed up, no time ticked -->
    <v-card v-if="withoutTicks.length" variant="outlined" class="pa-4 mb-4">
      <p class="field-label mb-1">{{ t('invest.sessionTimes.manage.noTicks', withoutTicks.length) }}</p>
      <p class="people mb-0">{{ withoutTicks.join(', ') }}</p>
    </v-card>

    <!-- A new candidate time -->
    <v-card v-if="open && times.length < maxTimes" variant="outlined" class="pa-4">
      <p class="field-label">{{ t('invest.sessionTimes.manage.addHeading') }}</p>
      <form class="add-form" @submit.prevent="add">
        <v-text-field
          v-model="draft.start"
          type="datetime-local"
          :label="t('invest.sessionTimes.manage.startLabel')"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-select
          v-model="draft.durationMinutes"
          :items="durations"
          :label="t('invest.sessionTimes.manage.durationLabel')"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-text-field
          v-model="draft.meetingUrl"
          :label="t('invest.sessionTimes.manage.urlOptional')"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-btn
          type="submit"
          :loading="busy === 'add'"
          :disabled="!draft.start"
          size="large"
          class="text-none"
          style="background-color: white; color: #111;"
        >
          {{ t('invest.sessionTimes.manage.add') }}
        </v-btn>
      </form>
      <p class="muted mt-2 mb-0">{{ t('invest.sessionTimes.manage.osloNote') }}</p>
    </v-card>
    <p v-else-if="!open" class="muted">{{ t('invest.session.errors.closed') }}</p>

    <v-alert v-if="error" type="warning" variant="outlined" class="mt-3 text-left">{{ error }}</v-alert>
  </section>
</template>

<script setup lang="ts">
// The committee's side of finding a time for the online session (current-komite only: the
// API is the 404 for anyone else), on /member/invest/:slug/komite. Add a handful of
// candidate times (Oslo time, length, optional Meet/Teams link), remove one, mark ONE as
// chosen; per time who can make it, and who signed up without ticking any. Plus the link
// to share: /member/invest/<slug>#nettmote. server/utils/investSessionTimes.ts, hq 052.
interface Time {
  id: string
  startsAt: string
  durationMinutes: number
  meetingUrl: string | null
  chosen: boolean
  people: string[]
}
interface Signup {
  name: string
  picks: number
}

const props = defineProps<{ slug: string; open: boolean; times: Time[]; signups: Signup[] }>()
const emit = defineEmits<{ changed: [] }>()

const { t, te } = useI18n()
const { format } = useLocaleDate()

const maxTimes = 12
const busy = ref<string | null>(null)
const error = ref('')
const copied = ref('')
const editingLink = ref<string | null>(null)
const linkDraft = ref('')
const confirmRemove = ref<string | null>(null)
const draft = ref({ start: '', durationMinutes: 60, meetingUrl: '' })

const durations = computed(() =>
  [30, 45, 60, 90].map((m) => ({ value: m, title: t('invest.sessionTimes.manage.minutes', { n: m }) })),
)
const best = computed(() => Math.max(0, ...props.times.map((x) => x.people.length)))
const withoutTicks = computed(() => props.signups.filter((s) => !s.picks).map((s) => s.name))
const shareUrl = computed(() => {
  const origin = import.meta.client ? window.location.origin : 'https://www.ctoroundtable.no'
  return `${origin}/member/invest/${props.slug}#nettmote`
})

function when(tm: Time) {
  const start = new Date(tm.startsAt)
  const end = new Date(start.getTime() + tm.durationMinutes * 60_000)
  const hm: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return {
    date: format(start, { weekday: 'long', day: 'numeric', month: 'long' }),
    range: t('invest.sessionTimes.range', { from: format(start, hm), to: format(end, hm) }),
  }
}

function fail(err: any) {
  const key = err?.data?.message
  error.value = key && te(key) ? t(key) : t('invest.errors.unknown')
}

async function run(tag: string, call: () => Promise<unknown>) {
  busy.value = tag
  error.value = ''
  try {
    await call()
    emit('changed')
    return true
  } catch (err) {
    fail(err)
    return false
  } finally {
    busy.value = null
  }
}

const base = computed(() => `/api/member/invest/${props.slug}/session-times`)

async function add() {
  const ok = await run('add', () => $fetch(base.value, { method: 'POST', body: draft.value }))
  if (ok) draft.value = { start: '', durationMinutes: draft.value.durationMinutes, meetingUrl: draft.value.meetingUrl }
}

function startLink(tm: Time) {
  linkDraft.value = tm.meetingUrl ?? ''
  editingLink.value = tm.id
}

async function saveLink(tm: Time) {
  const ok = await run(`link:${tm.id}`, () =>
    $fetch(`${base.value}/${tm.id}`, { method: 'PATCH', body: { meetingUrl: linkDraft.value } }),
  )
  if (ok) editingLink.value = null
}

async function choose(tm: Time, chosen: boolean) {
  await run(`choose:${tm.id}`, () => $fetch(`${base.value}/${tm.id}/choose`, { method: 'POST', body: { chosen } }))
}

// One tap arms it, the second removes: the ticks on it go too.
async function remove(tm: Time) {
  if (confirmRemove.value !== tm.id) {
    confirmRemove.value = tm.id
    return
  }
  const ok = await run(`remove:${tm.id}`, () => $fetch(`${base.value}/${tm.id}`, { method: 'DELETE' }))
  if (ok) confirmRemove.value = null
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = t('invest.sessionTimes.manage.linkCopied')
  } catch {
    copied.value = t('invest.session.list.copyFailed')
  }
}
</script>

<style scoped>
.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}
.intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
  max-width: 640px;
}
.field-label {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
}
.muted {
  color: #888;
  font-size: 13px;
}
.share-url {
  color: #ddd;
  font-size: 13px;
  overflow-wrap: anywhere;
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 8px;
  border-radius: 4px;
}
.times {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.time {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}
.time.chosen {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.06);
}
.time-date {
  color: #fff;
  font-weight: 700;
}
.time-date::first-letter {
  text-transform: uppercase;
}
.time-range {
  color: #ccc;
}
.count {
  color: #fff;
  font-size: 14px;
  margin-top: 4px;
}
.people {
  color: #ccc;
  font-size: 14px;
}
.link-line {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.link {
  color: #ddd;
  margin-left: 4px;
}
.add-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
@media (min-width: 760px) {
  .add-form {
    grid-template-columns: 1.3fr 0.8fr 1.5fr auto;
    align-items: center;
  }
}
.time :deep(.v-btn),
.add-form :deep(.v-btn) {
  letter-spacing: normal;
}
</style>
