<template>
  <section class="panel">
    <h2 class="panel-title mb-1">{{ t('invest.comments.heading') }}</h2>
    <p class="meta mb-4">{{ canReply ? t('invest.comments.introCommittee') : t('invest.comments.introMember') }}</p>

    <form class="mb-6" @submit.prevent="send">
      <v-chip-group v-model="kind" mandatory selected-class="kind-on" class="mb-2">
        <v-chip v-for="k in kinds" :key="k" :value="k" variant="outlined" size="small" class="kind">
          {{ t(`invest.comments.kind.${k}`) }}
        </v-chip>
      </v-chip-group>
      <v-select
        v-if="outline.length"
        v-model="anchor"
        :items="anchorItems"
        :label="t('invest.comments.anchorLabel')"
        variant="outlined"
        density="comfortable"
        hide-details
        theme="dark"
        class="mb-3"
      />
      <v-text-field
        v-if="anchor"
        v-model="quote"
        :label="t('invest.comments.quoteLabel')"
        :hint="t('invest.comments.quoteHint')"
        persistent-hint
        maxlength="300"
        variant="outlined"
        density="comfortable"
        theme="dark"
        class="mb-3"
      />
      <v-textarea
        v-model="draft"
        :label="kind === 'question' ? t('invest.comments.bodyQuestion') : t('invest.comments.bodyComment')"
        rows="3"
        auto-grow
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        theme="dark"
      />
      <div class="d-flex align-center flex-wrap mt-3" style="gap: 12px;">
        <v-btn type="submit" :loading="sending" :disabled="!draft.trim()" style="background-color: white; color: #111;">
          {{ t('invest.comments.submit') }}
        </v-btn>
        <span v-if="sent" class="ok-note">{{ t('invest.comments.sent') }}</span>
      </div>
      <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3 text-left">{{ error }}</v-alert>
    </form>

    <!-- The committee: every thread, with names, and the reply box. -->
    <template v-if="canReply">
      <div class="d-flex align-center flex-wrap mb-2" style="gap: 12px;">
        <p class="list-label mb-0">{{ t('invest.comments.allHeading') }} ({{ threads.length }})</p>
        <v-switch
          v-model="onlyUnanswered"
          :label="t('invest.comments.onlyUnanswered')"
          color="white"
          density="compact"
          hide-details
          theme="dark"
        />
      </div>
      <p v-if="!shownThreads.length" class="meta">{{ t('invest.comments.empty') }}</p>
    </template>

    <!-- A member: their own threads, then the answers shown to everyone. -->
    <template v-else>
      <p v-if="mineThreads.length" class="list-label mb-2">{{ t('invest.comments.mineHeading') }}</p>
    </template>

    <article
      v-for="th in canReply ? shownThreads : mineThreads"
      :key="th.id"
      class="thread"
      :class="{ withdrawn: th.withdrawnAt }"
    >
      <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
        <span class="kind-tag" :class="`kind-${th.kind}`">{{ t(`invest.comments.kind.${th.kind}`) }}</span>
        <span class="meta">{{ byline(th) }}</span>
        <span v-if="th.version < version" class="meta">· {{ t('invest.comments.olderVersion', { v: th.version }) }}</span>
        <span v-if="th.public" class="chip-public">{{ t('invest.comments.publicChip') }}</span>
        <span v-else-if="!th.replies.some((r) => !r.withdrawnAt) && !th.withdrawnAt" class="chip-waiting">{{ t('invest.comments.waiting') }}</span>
      </div>
      <button v-if="th.anchor" type="button" class="anchor-link" :title="t('invest.comments.showSlide')" @click="emit('showAnchor', th.anchor)">
        {{ anchorText(th) }} <v-icon size="13">mdi-arrow-up</v-icon>
      </button>
      <blockquote v-if="th.quote" class="quote">{{ th.quote }}</blockquote>
      <p class="c-body">{{ th.body }}</p>
      <p v-if="th.withdrawnAt" class="meta">{{ t('invest.comments.withdrawn') }}</p>
      <v-btn v-else-if="th.mine" size="small" variant="text" class="px-0" :loading="busy === th.id" @click="withdraw(th.id)">
        {{ t('invest.comments.withdraw') }}
      </v-btn>

      <div v-for="r in th.replies" :key="r.id" class="reply" :class="{ withdrawn: r.withdrawnAt }">
        <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
          <span class="meta reply-by">{{ r.author ? r.author.name : t('invest.comments.committee') }}</span>
          <span class="meta">{{ formatDate(r.createdAt, 'short') }}</span>
          <span v-if="canReply" :class="r.public ? 'chip-public' : 'meta'">
            {{ r.public ? t('invest.comments.publicChip') : t('invest.comments.privateChip') }}
          </span>
        </div>
        <p class="c-body">{{ r.body }}</p>
        <div v-if="canReply && !r.withdrawnAt" class="d-flex flex-wrap" style="gap: 4px;">
          <v-btn size="small" variant="text" class="px-0 mr-3" :loading="busy === r.id" @click="setPublic(r.id, !r.public)">
            {{ r.public ? t('invest.comments.makePrivate') : t('invest.comments.makePublic') }}
          </v-btn>
          <v-btn v-if="r.mine" size="small" variant="text" class="px-0" @click="withdraw(r.id)">
            {{ t('invest.comments.withdraw') }}
          </v-btn>
        </div>
        <p v-if="r.withdrawnAt" class="meta">{{ t('invest.comments.withdrawn') }}</p>
      </div>

      <form v-if="canReply && !th.withdrawnAt" class="reply-form" @submit.prevent="reply(th.id)">
        <v-textarea
          v-model="replyDraft[th.id]"
          :label="t('invest.comments.replyLabel')"
          rows="2"
          auto-grow
          variant="outlined"
          density="compact"
          hide-details
          theme="dark"
        />
        <v-checkbox
          v-model="replyPublic[th.id]"
          :label="t('invest.comments.replyPublic')"
          density="compact"
          hide-details
          theme="dark"
        />
        <v-btn
          type="submit"
          size="small"
          :loading="busy === `reply-${th.id}`"
          :disabled="!replyDraft[th.id]?.trim()"
          style="background-color: white; color: #111;"
        >
          {{ t('invest.comments.replySubmit') }}
        </v-btn>
      </form>
    </article>

    <template v-if="!canReply && publicThreads.length">
      <p class="list-label mt-6 mb-2">{{ t('invest.comments.publicHeading') }}</p>
      <article v-for="th in publicThreads" :key="th.id" class="thread">
        <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
          <span class="kind-tag" :class="`kind-${th.kind}`">{{ t(`invest.comments.kind.${th.kind}`) }}</span>
          <span v-if="th.version < version" class="meta">{{ t('invest.comments.olderVersion', { v: th.version }) }}</span>
        </div>
        <button v-if="th.anchor" type="button" class="anchor-link" :title="t('invest.comments.showSlide')" @click="emit('showAnchor', th.anchor)">
          {{ anchorText(th) }} <v-icon size="13">mdi-arrow-up</v-icon>
        </button>
        <blockquote v-if="th.quote" class="quote">{{ th.quote }}</blockquote>
        <p class="c-body">{{ th.body }}</p>
        <div v-for="r in th.replies" :key="r.id" class="reply">
          <p class="meta reply-by mb-1">{{ t('invest.comments.committee') }}</p>
          <p class="c-body">{{ r.body }}</p>
        </div>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
// Comments and questions on an offering document (the deck), and the committee's
// replies. What each viewer gets is decided on the server (server/utils/investComments.ts):
// the committee sees every thread with names; a member their own, plus replies the
// committee showed to everyone, without the asker's name.
interface Reply {
  id: string
  body: string
  public: boolean
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  author?: { name: string }
}
interface Thread {
  id: string
  kind: 'question' | 'comment'
  anchor: string | null
  anchorTitle: string | null
  quote: string | null
  body: string
  version: number
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  public: boolean
  replies: Reply[]
  author?: { name: string }
}

const props = defineProps<{ slug: string; docKey: string }>()
const emit = defineEmits<{ showAnchor: [anchor: string] }>()

const { t, te } = useI18n()
const { formatDate } = useLocaleDate()
const { $posthog } = useNuxtApp()

const kinds = ['question', 'comment'] as const
const kind = ref<'question' | 'comment'>('question')
const anchor = ref<string | null>(null)
const quote = ref('')
const draft = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref('')
const busy = ref<string | null>(null)
const onlyUnanswered = ref(false)
const replyDraft = ref<Record<string, string>>({})
const replyPublic = ref<Record<string, boolean>>({})

const canReply = ref(false)
const version = ref(0)
const outline = ref<{ id: string; title: string }[]>([])
const threads = ref<Thread[]>([])

const base = computed(() => `/api/member/invest/${props.slug}`)

const anchorItems = computed(() => [
  { title: t('invest.comments.anchorAll'), value: null },
  ...outline.value.map((o, i) => ({ title: `${i + 1}. ${o.title || o.id}`, value: o.id })),
])

const answered = (th: Thread) => th.replies.some((r) => !r.withdrawnAt)
const shownThreads = computed(() =>
  // Newest first for the committee; with the switch on, only what still waits on it.
  [...threads.value].reverse().filter((th) => !onlyUnanswered.value || (!answered(th) && !th.withdrawnAt)),
)
const mineThreads = computed(() => [...threads.value].reverse().filter((th) => th.mine))
const publicThreads = computed(() => threads.value.filter((th) => !th.mine && th.public))

function anchorText(th: Thread) {
  const n = outline.value.findIndex((o) => o.id === th.anchor)
  const title = th.anchorTitle || th.anchor
  return n >= 0 && th.version === version.value ? `${n + 1}. ${title}` : title
}

function byline(th: Thread) {
  const date = formatDate(th.createdAt, 'short')
  return th.author ? `${th.author.name} · ${date}` : date
}

function errorText(e: any) {
  const key = e?.data?.message
  return key && te(key) ? t(key) : t('invest.comments.errors.unknown')
}

async function load() {
  const res = await $fetch<{
    canReply: boolean
    version: number
    outline: { id: string; title: string }[]
    threads: Thread[]
  }>(`${base.value}/documents/${props.docKey}/comments`)
  canReply.value = res.canReply
  version.value = res.version
  outline.value = res.outline
  threads.value = res.threads
}

async function send() {
  error.value = ''
  sent.value = false
  sending.value = true
  try {
    await $fetch(`${base.value}/documents/${props.docKey}/comments`, {
      method: 'POST',
      body: { kind: kind.value, body: draft.value, anchor: anchor.value, quote: anchor.value ? quote.value : null },
    })
    $posthog?.capture?.('invest_document_comment_added', { slug: props.slug, key: props.docKey, kind: kind.value })
    draft.value = ''
    quote.value = ''
    sent.value = true
    await load()
  } catch (e: any) {
    error.value = errorText(e)
  } finally {
    sending.value = false
  }
}

async function act(id: string, run: () => Promise<unknown>) {
  error.value = ''
  busy.value = id
  try {
    await run()
    await load()
  } catch (e: any) {
    error.value = errorText(e)
  } finally {
    busy.value = null
  }
}

function reply(threadId: string) {
  return act(`reply-${threadId}`, async () => {
    await $fetch(`${base.value}/comments/${threadId}/reply`, {
      method: 'POST',
      body: { body: replyDraft.value[threadId] ?? '', public: Boolean(replyPublic.value[threadId]) },
    })
    replyDraft.value[threadId] = ''
    replyPublic.value[threadId] = false
  })
}

function setPublic(replyId: string, value: boolean) {
  return act(replyId, () =>
    $fetch(`${base.value}/comments/${replyId}/public`, { method: 'POST', body: { public: value } }),
  )
}

function withdraw(id: string) {
  return act(id, () => $fetch(`${base.value}/comments/${id}/withdraw`, { method: 'POST' }))
}

onMounted(() => {
  load().catch(() => {
    error.value = t('invest.comments.errors.unknown')
  })
})
</script>

<style scoped>
.panel {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 28px;
  padding: 28px 0;
}
.panel-title {
  font-size: 1.2rem;
  font-weight: 650;
  color: #fff;
}
.meta {
  color: #888;
  font-size: 13px;
}
.ok-note {
  color: #81c784;
  font-size: 13px;
}
.kind {
  color: #bbb !important;
}
.kind-on {
  background: #fff !important;
  color: #111 !important;
}
.list-label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.thread {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px 0 8px;
}
.thread.withdrawn > .c-body,
.reply.withdrawn .c-body {
  color: #777;
  text-decoration: line-through;
}
.c-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  margin-bottom: 4px;
}
.kind-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 2px 7px;
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.kind-question {
  color: #90caf9;
  border-color: rgba(144, 202, 249, 0.5);
}
.chip-public {
  color: #81c784;
  font-size: 12px;
  font-weight: 600;
}
.chip-waiting {
  color: #ffcc80;
  font-size: 12px;
  font-weight: 600;
}
.anchor-link {
  color: #bbb;
  font-size: 13px;
  text-align: left;
  margin-bottom: 4px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.anchor-link:hover {
  color: #fff;
}
.quote {
  color: #aaa;
  font-size: 13px;
  font-style: italic;
  border-left: 2px solid rgba(255, 255, 255, 0.25);
  padding-left: 10px;
  margin: 4px 0 8px;
}
.reply {
  margin: 8px 0 4px 14px;
  padding-left: 12px;
  border-left: 2px solid rgba(129, 199, 132, 0.5);
}
.reply-by {
  color: #ccc;
  font-weight: 600;
}
.reply-form {
  margin: 10px 0 4px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.reply-form :deep(.v-textarea) {
  width: 100%;
}
</style>
