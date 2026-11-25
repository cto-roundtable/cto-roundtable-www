<template>
  <section v-if="open || session || chosen" id="nettmote" class="session-card mb-6">
    <div class="d-flex align-start" style="gap: 12px;">
      <v-icon color="white" size="22" class="mt-1">mdi-video-outline</v-icon>
      <div class="flex-grow-1">
        <h2 class="section-title">{{ t('invest.session.heading') }}</h2>
        <p class="intro mb-0">
          {{ chosen ? t('invest.sessionTimes.chosenIntro') : candidates.length ? t('invest.sessionTimes.intro') : t('invest.session.intro') }}
        </p>
      </div>
    </div>

    <!-- A time is chosen: that time (and the link), instead of the ticks -->
    <template v-if="chosen">
      <div class="chosen mt-4">
        <p class="chosen-label mb-1">{{ t('invest.sessionTimes.chosenLabel') }}</p>
        <p class="chosen-when mb-0">{{ when(chosen).date }}</p>
        <p class="chosen-range mb-0">{{ when(chosen).range }}</p>
        <v-btn
          v-if="chosen.meetingUrl"
          :href="chosen.meetingUrl"
          target="_blank"
          rel="noopener noreferrer"
          prepend-icon="mdi-video"
          class="text-none mt-3"
          style="background-color: white; color: #111;"
        >
          {{ t('invest.sessionTimes.join') }}
        </v-btn>
        <p v-else class="muted mt-2 mb-0">{{ t('invest.sessionTimes.linkLater') }}</p>
      </div>
      <p v-if="session" class="muted mt-3 mb-1">{{ t('invest.sessionTimes.youAreIn') }}</p>
    </template>

    <!-- Candidate times, Doodle style: tick every time that works. Ticking signs you up. -->
    <form v-else-if="candidates.length" class="mt-4" @submit.prevent="savePicks">
      <v-alert
        v-if="session && savedNow"
        type="success"
        variant="tonal"
        icon="mdi-check-circle-outline"
        class="text-left mb-3"
      >
        {{ picked.length ? t('invest.sessionTimes.saved', picked.length) : t('invest.sessionTimes.savedNone') }}
      </v-alert>
      <p class="field-label mb-1">{{ t('invest.sessionTimes.pickLabel') }}</p>
      <div class="times">
        <label
          v-for="tm in candidates"
          :key="tm.id"
          class="time"
          :class="{ on: picked.includes(tm.id), past: isPast(tm) }"
        >
          <input
            v-model="picked"
            type="checkbox"
            :value="tm.id"
            :disabled="!open || isPast(tm)"
            class="time-box"
          >
          <span class="flex-grow-1">
            <span class="time-date">{{ when(tm).date }}</span>
            <span class="time-range">{{ when(tm).range }}</span>
          </span>
          <v-icon v-if="picked.includes(tm.id)" size="20" color="white">mdi-check</v-icon>
        </label>
      </div>
      <div v-if="open" class="d-flex flex-wrap mt-3" style="gap: 8px;">
        <v-btn
          type="submit"
          :loading="busy === 'picks'"
          :disabled="!dirty || (!session && !picked.length)"
          size="large"
          class="text-none signup-btn"
          :block="!session"
          style="background-color: white; color: #111;"
        >
          {{ session ? t('invest.sessionTimes.save') : t('invest.sessionTimes.signUp') }}
        </v-btn>
      </div>
      <p v-if="!session && !picked.length" class="muted mt-2 mb-0">{{ t('invest.sessionTimes.tickFirst') }}</p>
    </form>

    <!-- Signed up: said back, the note, and undo -->
    <template v-if="session && !editing">
      <v-alert
        v-if="!candidates.length && !chosen"
        type="success"
        variant="tonal"
        icon="mdi-check-circle-outline"
        class="text-left mt-4 mb-2"
      >
        {{ t('invest.session.signedUp') }}
      </v-alert>
      <p class="muted mt-3 mb-1">{{ t('invest.session.signedUpAt', { date: formatDate(session.signedUpAt) }) }}</p>
      <p v-if="session.note" class="note mb-2">{{ t('invest.session.yourNote', { note: session.note }) }}</p>
      <div v-if="open" class="d-flex flex-wrap" style="gap: 8px;">
        <v-btn variant="outlined" class="text-none" @click="startEdit">
          {{ session.note ? t('invest.session.editNote') : t('invest.session.addNote') }}
        </v-btn>
        <v-btn variant="text" class="text-none" :loading="busy === 'remove'" @click="remove">
          {{ t('invest.session.cancel') }}
        </v-btn>
      </div>
    </template>

    <!-- Changing the note on a sign-up -->
    <form v-else-if="session" class="mt-4" @submit.prevent="save">
      <v-textarea
        v-model="note"
        :label="t('invest.session.noteLabel')"
        :placeholder="t('invest.session.notePlaceholder')"
        :counter="max"
        :rules="[(v: string) => [...(v ?? '').trim()].length <= max || t('invest.session.errors.tooLong', { max })]"
        rows="2"
        auto-grow
        autofocus
        variant="outlined"
        density="comfortable"
        class="mb-2"
      />
      <div class="d-flex flex-wrap" style="gap: 8px;">
        <v-btn type="submit" :loading="busy === 'save'" :disabled="tooLong" class="text-none" style="background-color: white; color: #111;">
          {{ t('invest.session.saveNote') }}
        </v-btn>
        <v-btn variant="text" class="text-none" @click="editing = false">{{ t('invest.session.keep') }}</v-btn>
      </div>
    </form>

    <!-- Not signed up and no times to tick: one button (also once a time is chosen) -->
    <template v-else-if="open && (!candidates.length || chosen)">
      <v-btn
        :loading="busy === 'save'"
        size="large"
        block
        class="text-none mt-4 signup-btn"
        style="background-color: white; color: #111;"
        @click="save"
      >
        {{ chosen ? t('invest.sessionTimes.signUpChosen') : t('invest.session.signUp') }}
      </v-btn>
      <p v-if="justRemoved" class="muted mt-3 mb-0">{{ t('invest.session.removed') }}</p>
    </template>
    <p v-else-if="justRemoved" class="muted mt-3 mb-0">{{ t('invest.session.removed') }}</p>

    <v-alert v-if="error" type="warning" variant="outlined" class="mt-3 text-left">{{ error }}</v-alert>
  </section>
</template>

<script setup lang="ts">
// The online info session about the offering, the member's side. Apart from the interest
// answer on the same page: no answer is needed and none is implied
// (server/utils/investSessions.ts). Three states:
// - no candidate times yet: one button to sign up, then a note ("when suits best");
// - the committee has put in candidate times (hq 052, server/utils/investSessionTimes.ts):
//   tick every time that works, Doodle style; ticking signs you up, and you can change it;
// - the committee has chosen a time: that time and its link, instead of the ticks.
// The card's anchor is #nettmote, the link Snorre shares (/member/invest/<slug>#nettmote).
interface SessionTime {
  id: string
  startsAt: string
  durationMinutes: number
  chosen: boolean
  meetingUrl: string | null
}
interface SessionSignup {
  note: string | null
  signedUpAt: string
  updatedAt: string
  picks?: string[]
}

const props = defineProps<{ slug: string; open: boolean; initial: SessionSignup | null; times?: SessionTime[] }>()
const emit = defineEmits<{ changed: [session: SessionSignup | null] }>()

const { t, te } = useI18n()
const { formatDate, format } = useLocaleDate()

const max = 280
const session = ref<SessionSignup | null>(props.initial)
const note = ref(props.initial?.note ?? '')
const editing = ref(false)
const busy = ref<'save' | 'remove' | 'picks' | null>(null)
const error = ref('')
const justRemoved = ref(false)
const savedNow = ref(false)

const candidates = computed(() => props.times ?? [])
const chosen = computed(() => candidates.value.find((x) => x.chosen) ?? null)
const picked = ref<string[]>([...(props.initial?.picks ?? [])])
const savedPicks = ref<string[]>([...(props.initial?.picks ?? [])])
const dirty = computed(
  () => picked.value.length !== savedPicks.value.length || picked.value.some((id) => !savedPicks.value.includes(id)),
)
watch(picked, () => {
  savedNow.value = false
})

const tooLong = computed(() => [...note.value.trim()].length > max)

function when(tm: SessionTime) {
  const start = new Date(tm.startsAt)
  const end = new Date(start.getTime() + tm.durationMinutes * 60_000)
  const hm: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  return {
    date: format(start, { weekday: 'long', day: 'numeric', month: 'long' }),
    range: t('invest.sessionTimes.range', { from: format(start, hm), to: format(end, hm) }),
  }
}

function isPast(tm: SessionTime) {
  return new Date(tm.startsAt).getTime() < Date.now()
}

function startEdit() {
  note.value = session.value?.note ?? ''
  editing.value = true
}

function fail(err: any) {
  const key = err?.data?.message
  error.value = key && te(key) ? t(key, { max }) : t('invest.errors.unknown')
}

async function savePicks() {
  busy.value = 'picks'
  error.value = ''
  try {
    const result = await $fetch<{ session: SessionSignup | null }>(`/api/member/invest/${props.slug}/session/times`, {
      method: 'POST',
      body: { timeIds: picked.value },
    })
    session.value = result.session
    savedPicks.value = [...(result.session?.picks ?? [])]
    picked.value = [...savedPicks.value]
    await nextTick()
    savedNow.value = true
    justRemoved.value = false
    emit('changed', session.value)
  } catch (err) {
    fail(err)
  } finally {
    busy.value = null
  }
}

async function save() {
  if (tooLong.value) return
  busy.value = 'save'
  error.value = ''
  try {
    const result = await $fetch<{ session: SessionSignup | null }>(`/api/member/invest/${props.slug}/session`, {
      method: 'POST',
      body: { note: note.value },
    })
    session.value = result.session ? { ...result.session, picks: savedPicks.value } : null
    editing.value = false
    justRemoved.value = false
    emit('changed', session.value)
  } catch (err) {
    fail(err)
  } finally {
    busy.value = null
  }
}

async function remove() {
  busy.value = 'remove'
  error.value = ''
  try {
    await $fetch(`/api/member/invest/${props.slug}/session`, { method: 'DELETE' })
    session.value = null
    note.value = ''
    // Undoing the sign-up takes the ticks with it (hq 052, ON DELETE CASCADE).
    picked.value = []
    savedPicks.value = []
    savedNow.value = false
    justRemoved.value = true
    emit('changed', null)
  } catch (err) {
    fail(err)
  } finally {
    busy.value = null
  }
}
</script>

<style scoped>
.session-card {
  padding: 16px 18px;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  scroll-margin-top: 80px;
}
.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
  line-height: 1.4;
}
.intro {
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;
}
.field-label {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}
/* The buttons say whole sentences: normal spacing, and the main one may wrap on a narrow phone. */
.session-card :deep(.v-btn) {
  letter-spacing: normal;
}
.signup-btn {
  white-space: normal;
  height: auto !important;
  min-height: 48px;
  padding-top: 10px;
  padding-bottom: 10px;
}
.signup-btn :deep(.v-btn__content) {
  white-space: normal;
  line-height: 1.3;
}
.times {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* A whole row is the tap target: big enough for a thumb. */
.time {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  color: #ddd;
}
.time.on {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.time.past {
  opacity: 0.5;
  cursor: default;
}
.time-box {
  width: 20px;
  height: 20px;
  accent-color: #fff;
  flex-shrink: 0;
}
.time-date {
  display: block;
  font-weight: 600;
  font-size: 15px;
}
.time-date::first-letter,
.chosen-when::first-letter {
  text-transform: uppercase;
}
.time-range {
  display: block;
  font-size: 14px;
  color: #aaa;
}
.chosen {
  padding: 12px 14px;
  border: 1px solid #fff;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}
.chosen-label {
  color: #aaa;
  font-size: 13px;
}
.chosen-when {
  color: #fff;
  font-weight: 700;
  font-size: 1.05rem;
}
.chosen-range {
  color: #ddd;
  font-size: 15px;
}
.muted {
  color: #888;
  font-size: 13px;
}
.note {
  color: #ccc;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
