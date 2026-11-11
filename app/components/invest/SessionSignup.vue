<template>
  <section v-if="open || session" id="invest-session" class="session-card mb-6">
    <div class="d-flex align-start" style="gap: 12px;">
      <v-icon color="white" size="22" class="mt-1">mdi-video-outline</v-icon>
      <div class="flex-grow-1">
        <h2 class="section-title">{{ t('invest.session.heading') }}</h2>
        <p class="intro mb-0">{{ t('invest.session.intro') }}</p>
      </div>
    </div>

    <!-- Signed up: said back, the note, and undo -->
    <template v-if="session && !editing">
      <v-alert type="success" variant="tonal" icon="mdi-check-circle-outline" class="text-left mt-4 mb-2">
        {{ t('invest.session.signedUp') }}
      </v-alert>
      <p class="muted mb-1">{{ t('invest.session.signedUpAt', { date: formatDate(session.signedUpAt) }) }}</p>
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

    <!-- Not signed up: one button, nothing else to fill in -->
    <template v-else>
      <v-btn
        :loading="busy === 'save'"
        size="large"
        block
        class="text-none mt-4 signup-btn"
        style="background-color: white; color: #111;"
        @click="save"
      >
        {{ t('invest.session.signUp') }}
      </v-btn>
      <p v-if="justRemoved" class="muted mt-3 mb-0">{{ t('invest.session.removed') }}</p>
    </template>

    <v-alert v-if="error" type="warning" variant="outlined" class="mt-3 text-left">{{ error }}</v-alert>
  </section>
</template>

<script setup lang="ts">
// "Jeg vil være med på et nettmøte": the member's own sign-up for an online info
// session about the offering. Apart from the interest answer on the same page: no
// answer is needed and none is implied (server/utils/investSessions.ts). There is no
// fixed meeting: Snorre finds a time with everyone who signs up (2026-11-11), so no
// times are shown. First view is one button; the note ("when suits best") comes after.
interface SessionSignup {
  note: string | null
  signedUpAt: string
  updatedAt: string
}

const props = defineProps<{ slug: string; open: boolean; initial: SessionSignup | null }>()
const emit = defineEmits<{ changed: [session: SessionSignup | null] }>()

const { t, te } = useI18n()
const { formatDate } = useLocaleDate()

const max = 280
const session = ref<SessionSignup | null>(props.initial)
const note = ref(props.initial?.note ?? '')
const editing = ref(false)
const busy = ref<'save' | 'remove' | null>(null)
const error = ref('')
const justRemoved = ref(false)

const tooLong = computed(() => [...note.value.trim()].length > max)

function startEdit() {
  note.value = session.value?.note ?? ''
  editing.value = true
}

function fail(err: any) {
  const key = err?.data?.message
  error.value = key && te(key) ? t(key, { max }) : t('invest.errors.unknown')
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
    session.value = result.session
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
