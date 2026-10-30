<template>
  <article class="lead" :class="{ 'lead-page': onPage }">
    <header v-if="!onPage" class="lead-head">
      <NuxtLink :to="`/member/caser/${lead.slug}`" class="lead-name">{{ lead.name }}</NuxtLink>
      <span class="lead-when">{{ whenLine }}</span>
    </header>

    <dl class="lead-facts">
      <div>
        <dt>{{ t('deals.case.ownerLabel') }}</dt>
        <dd>{{ drivers || t('deals.lead.noOwner') }}</dd>
      </div>
      <div>
        <dt>{{ t('deals.lead.howLabel') }}</dt>
        <dd>{{ howLine }}</dd>
      </div>
      <div v-if="onPage">
        <dt>{{ t('deals.lead.createdLabel') }}</dt>
        <dd>{{ formatDate(lead.createdAt, 'short') }}</dd>
      </div>
      <div v-if="lead.slackUrl">
        <dt>{{ t('deals.lead.slackLabel') }}</dt>
        <dd>
          <a :href="lead.slackUrl" target="_blank" rel="noopener" class="ext">
            {{ t('deals.lead.slackOpen') }}<v-icon size="13" class="ml-1" aria-hidden="true">mdi-open-in-new</v-icon>
          </a>
        </dd>
      </div>
    </dl>

    <p v-if="lead.lastActivityNote" class="lead-note">
      <span class="note-date">{{ formatDate(lead.lastActivityAt ?? lead.createdAt, 'short') }}</span>
      {{ lead.lastActivityNote }}
    </p>
    <p v-if="showOrigin" class="lead-origin">
      <span class="note-date">{{ t('deals.lead.originLabel', { date: formatDate(lead.origin.occurredAt, 'short') }) }}</span>
      {{ lead.origin.body }}
    </p>

    <!-- Out of 'incoming': pick a move, add a note if you like, confirm. -->
    <div class="moves" role="group" :aria-label="t('deals.lead.movesAria', { name: lead.name })">
      <template v-if="!chosen">
        <v-btn
          v-for="a in ACTIONS"
          :key="a"
          size="small"
          :variant="a === 'review' ? 'flat' : 'outlined'"
          :class="a === 'review' ? 'move-primary' : 'move'"
          @click="choose(a)"
        >
          {{ t(`deals.lead.action.${a}`) }}
        </v-btn>
      </template>
      <form v-else class="confirm" @submit.prevent="confirm">
        <p class="confirm-line">{{ t('deals.lead.confirm', { name: lead.name, status: statusLabel(chosen) }) }}</p>
        <v-text-field
          ref="noteField"
          v-model="note"
          :label="t('deals.lead.noteLabel')"
          variant="outlined"
          density="compact"
          hide-details="auto"
          theme="dark"
          :maxlength="MAX_NOTE"
          :counter="note.length > MAX_NOTE - 40 ? MAX_NOTE : undefined"
        />
        <div class="confirm-buttons">
          <v-btn type="submit" size="small" :loading="busy" class="move-primary" variant="flat">
            {{ t(`deals.lead.action.${chosen}`) }}
          </v-btn>
          <v-btn size="small" variant="text" :disabled="busy" @click="cancel">{{ t('deals.lead.cancel') }}</v-btn>
        </div>
      </form>
    </div>
    <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-2">{{ error }}</v-alert>
  </article>
</template>

<script setup lang="ts">
// One new lead (status 'incoming') as the committee sees it: ansvarlig, how it came in,
// when, the last note, the first thing logged, the Slack channel; and the three moves out
// of 'incoming' (POST /api/member/committee/leads/:slug). On /member/komite in the
// "Nye leads" fold, and on the case page (onPage). Committee only: members never get a lead.
interface Lead {
  slug: string
  name: string
  owner: string | null
  coLeads: string[]
  contactedHow: string | null
  contact: string | null
  createdAt: string
  lastActivityAt: string | null
  lastActivityNote: string | null
  slackUrl: string | null
  origin: { occurredAt: string; kind: string; body: string } | null
  section: 'new' | 'inactive'
}
const ACTIONS = ['review', 'waiting', 'decline'] as const
type Action = (typeof ACTIONS)[number]
const TO: Record<Action, string> = { review: 'reviewing', waiting: 'waiting', decline: 'rejected' }
const MAX_NOTE = 280

const props = defineProps<{ lead: Lead; onPage?: boolean }>()
const emit = defineEmits<{ moved: [{ slug: string; name: string; status: string }] }>()

const { t, te } = useI18n()
const { formatDate } = useLocaleDate()
const { $posthog } = useNuxtApp()
const chosen = ref<Action | null>(null)
const note = ref('')
const busy = ref(false)
const error = ref('')
const noteField = ref<{ focus: () => void } | null>(null)

const drivers = computed(() => [props.lead.owner, ...props.lead.coLeads].filter(Boolean).join(', '))

const howLine = computed(() => {
  const h = props.lead.contactedHow
  const how = h && te(`deals.lead.how.${h}`) ? t(`deals.lead.how.${h}`) : t('deals.lead.howUnknown')
  return props.lead.contact ? t('deals.lead.howWithContact', { how, contact: props.lead.contact }) : how
})

// The first thing logged, unless the last note already says the same.
const showOrigin = computed(() => {
  const o = props.lead.origin?.body
  const n = props.lead.lastActivityNote
  return !!o && !(n && (o.startsWith(n.slice(0, 60)) || n.startsWith(o.slice(0, 60))))
})

const whenLine = computed(() => {
  const created = t('deals.lead.created', { date: formatDate(props.lead.createdAt, 'short') })
  return props.lead.lastActivityAt
    ? `${created} · ${t('deals.lead.lastActivity', { date: formatDate(props.lead.lastActivityAt, 'short') })}`
    : created
})

function statusLabel(a: Action) {
  return t(`deals.status.${TO[a]}`)
}

function choose(a: Action) {
  chosen.value = a
  error.value = ''
  nextTick(() => noteField.value?.focus())
}

function cancel() {
  chosen.value = null
  note.value = ''
  error.value = ''
}

async function confirm() {
  if (!chosen.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ slug: string; status: string }>(`/api/member/committee/leads/${props.lead.slug}`, {
      method: 'POST',
      body: { action: chosen.value, note: note.value.trim() || null },
    })
    $posthog?.capture?.('deal_lead_moved', { slug: props.lead.slug, action: chosen.value, note: !!note.value.trim() })
    emit('moved', { slug: res.slug, name: props.lead.name, status: res.status })
    cancel()
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || t('deals.lead.error')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.lead {
  padding: 16px 18px;
}
.lead + .lead {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.lead-page {
  padding: 0;
}
.lead-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
  margin-bottom: 8px;
}
.lead-name {
  color: #fff;
  font-weight: 600;
  font-size: 15.5px;
  text-decoration: none;
}
.lead-name:hover,
.lead-name:focus-visible {
  text-decoration: underline;
}
.lead-when {
  color: #999;
  font-size: 13px;
}
.lead-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 28px;
  margin: 0 0 8px;
}
.lead-facts dt {
  color: #999;
  font-size: 12px;
}
.lead-facts dd {
  color: #ddd;
  font-size: 14px;
  margin: 0;
}
.ext {
  color: #ddd;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
}
.ext:hover,
.ext:focus-visible {
  color: #fff;
}
.lead-note,
.lead-origin {
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
  max-width: 72ch;
  margin: 0 0 6px;
}
.lead-origin {
  color: #999;
  font-size: 13px;
}
.note-date {
  color: #888;
  font-size: 12.5px;
  margin-right: 6px;
}
.moves {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.move-primary {
  background-color: #fff !important;
  color: #111 !important;
}
.move {
  color: #ddd;
  border-color: rgba(255, 255, 255, 0.3);
}
.confirm {
  flex: 1 1 100%;
  max-width: 560px;
}
.confirm-line {
  color: #fff;
  font-size: 14px;
  margin: 0 0 8px;
}
.confirm-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
