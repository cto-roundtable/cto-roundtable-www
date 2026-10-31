<template>
  <div class="dcl">
    <p v-if="commenting && !panel" class="dcl-hint">{{ t('invest.comments.inline.tapHint') }}</p>

    <aside v-if="panel" class="dcl-panel" :aria-label="panelTitle">
      <div class="d-flex align-center mb-2" style="gap: 8px;">
        <h3 class="dcl-title">{{ panelTitle }}</h3>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('invest.comments.inline.close')" @click="close" />
      </div>

      <!-- A new comment where the reader tapped or selected. -->
      <form v-if="panel.kind === 'new'" @submit.prevent="send">
        <p class="meta mb-1">{{ placeText(panel.draft.slide, panel.draft.anchor === null) }}</p>
        <blockquote v-if="panel.draft.quote" class="quote">{{ panel.draft.quote }}</blockquote>
        <v-chip-group v-model="kind" mandatory selected-class="on" class="mb-1">
          <v-chip v-for="k in kinds" :key="k" :value="k" variant="outlined" size="small" class="opt">
            {{ t(`invest.comments.kind.${k}`) }}
          </v-chip>
        </v-chip-group>
        <v-chip-group v-model="visibility" mandatory selected-class="on">
          <v-chip v-for="v in visibilities" :key="v" :value="v" variant="outlined" size="small" class="opt">
            {{ t(`invest.comments.visibility.${v}`) }}
          </v-chip>
        </v-chip-group>
        <p class="meta mb-2">{{ visibilityHint }}</p>
        <v-textarea
          ref="input"
          v-model="draft"
          :label="kind === 'question' ? t('invest.comments.bodyQuestion') : t('invest.comments.bodyComment')"
          rows="3"
          auto-grow
          variant="outlined"
          density="compact"
          hide-details="auto"
          theme="dark"
        />
        <div class="d-flex align-center mt-2" style="gap: 8px;">
          <v-btn type="submit" size="small" :loading="busy === 'send'" :disabled="!draft.trim()" class="dcl-send">
            {{ t('invest.comments.submit') }}
          </v-btn>
          <v-btn size="small" variant="text" @click="close">{{ t('invest.comments.inline.cancel') }}</v-btn>
        </div>
      </form>

      <!-- A thread: from its marker, or from the list. -->
      <template v-else-if="thread">
        <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
          <span class="kind-tag" :class="`kind-${thread.kind}`">{{ t(`invest.comments.kind.${thread.kind}`) }}</span>
          <span class="meta">{{ byline(thread) }}</span>
          <span v-if="thread.public" class="chip-public">{{ t('invest.comments.publicChip') }}</span>
          <span v-else-if="thread.mine" class="meta">{{ t('invest.comments.visibility.committee') }}</span>
        </div>
        <p class="meta mb-1">{{ placeText(thread.slide, !thread.anchor || thread.anchor === thread.slide) }}</p>
        <blockquote v-if="thread.quote" class="quote">{{ thread.quote }}</blockquote>
        <p class="c-body" :class="{ gone: thread.withdrawnAt }">{{ thread.body }}</p>
        <p v-if="justSent === thread.id" class="ok-note">{{ t('invest.comments.inline.sent') }}</p>
        <p v-if="thread.withdrawnAt" class="meta">{{ t('invest.comments.withdrawn') }}</p>
        <v-btn
          v-else-if="thread.mine"
          size="small"
          variant="text"
          class="px-0"
          :loading="busy === thread.id"
          @click="act(thread.id, () => comments.withdraw(thread!.id))"
        >
          {{ t('invest.comments.withdraw') }}
        </v-btn>

        <div v-for="r in thread.replies" :key="r.id" class="reply" :class="{ gone: r.withdrawnAt }">
          <p class="meta reply-by mb-1">
            {{ r.author ? r.author.name : t('invest.comments.committee') }} · {{ formatDate(r.createdAt, 'short') }}
            <span v-if="canReply" :class="r.public ? 'chip-public' : 'meta'">
              · {{ r.public ? t('invest.comments.publicChip') : t('invest.comments.privateChip') }}
            </span>
          </p>
          <p class="c-body">{{ r.body }}</p>
        </div>

        <form v-if="canReply && !thread.withdrawnAt" class="mt-3" @submit.prevent="reply">
          <v-textarea
            v-model="replyDraft"
            :label="t('invest.comments.replyLabel')"
            rows="2"
            auto-grow
            variant="outlined"
            density="compact"
            hide-details
            theme="dark"
          />
          <v-checkbox
            v-model="replyPublic"
            :label="thread.visibility === 'all' ? t('invest.comments.replyPublicOpen') : t('invest.comments.replyPublic')"
            density="compact"
            hide-details
            theme="dark"
          />
          <v-btn type="submit" size="small" :loading="busy === 'reply'" :disabled="!replyDraft.trim()" class="dcl-send">
            {{ t('invest.comments.replySubmit') }}
          </v-btn>
        </form>
      </template>

      <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3 text-left">{{ error }}</v-alert>
    </aside>
  </div>
</template>

<script setup lang="ts">
// Comments IN the deck, like huddle and the review tool: tap a block or select words
// in a slide and comment right there; a numbered marker stays on the slide, and a tap
// on it opens the thread beside the deck (a sheet from the bottom on a phone).
//
// The half in the frame is huddle's review-kit bridge (app/vendor/huddle-review-kit/,
// ctori-4 dc-65 H1): it names the block a tap or a selection landed on and draws the
// markers we send it. This is the other half, the portal's own: it speaks the bridge's
// protocol ({hb: 1}, from the frame checked by DocumentViewer on event.source) and
// writes through useDocumentComments, so who sees what stays the server's.
//
// Reading comes first: with "Kommenter" off, a tap is the page's (links, swipes), and
// only selected words get the bridge's "Kommenter" chip. With it on, a tap on a block
// comments on it. Markers are sent for the slide on screen only: a block on a hidden
// slide has no place to put one.
import type { CommentVisibility, DocumentComments, DocumentThread } from '~/composables/useDocumentComments'

interface Viewer {
  send: (message: Record<string, unknown>) => void
  showAnchor: (id: string) => void
  slides: { id: string | null; title: string }[]
  at: number
  mode: 'slides' | 'scroll'
}

interface Draft {
  anchor: string | null
  slide: string | null
  quote: string | null
  target: Record<string, unknown> | null
}

const props = defineProps<{ comments: DocumentComments; viewer: Viewer | null; commenting: boolean }>()

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { threads, canReply, version, publicShowsAuthor } = props.comments

const kinds = ['question', 'comment'] as const
const visibilities = ['committee', 'all'] as const
const kind = ref<'question' | 'comment'>('comment')
const visibility = ref<CommentVisibility>(props.comments.defaultVisibility.value)
const draft = ref('')
const replyDraft = ref('')
const replyPublic = ref(false)
const busy = ref<string | null>(null)
const error = ref('')
const justSent = ref<string | null>(null)
const input = ref<{ focus: () => void } | null>(null)
const panel = ref<{ kind: 'new'; draft: Draft } | { kind: 'thread'; id: string } | null>(null)
let ready = false

const thread = computed(() =>
  panel.value?.kind === 'thread' ? (threads.value.find((th) => th.id === (panel.value as any).id) ?? null) : null,
)
const panelTitle = computed(() =>
  panel.value?.kind === 'new' ? t('invest.comments.inline.newTitle') : t('invest.comments.heading'),
)
const visibilityHint = computed(() => {
  if (visibility.value === 'committee') return t('invest.comments.visibilityHint.committee')
  return publicShowsAuthor.value
    ? t('invest.comments.visibilityHint.allNamed')
    : t('invest.comments.visibilityHint.allAnonymous')
})

/** The slide on screen, as a comment names it: its id, else its number. */
function currentSlide(): string | null {
  const v = props.viewer
  if (!v || !v.slides.length) return null
  return v.slides[v.at]?.id ?? String(v.at + 1)
}

function slideNumber(slide: string | null): number | null {
  const v = props.viewer
  if (!slide || !v) return null
  const i = v.slides.findIndex((s) => s.id === slide)
  if (i >= 0) return i + 1
  return /^[0-9]+$/.test(slide) ? Number(slide) : null
}

function placeText(slide: string | null, whole: boolean) {
  const n = slideNumber(slide)
  if (n === null) return t('invest.comments.anchorAll')
  const s = t('invest.comments.inline.onSlide', { n })
  return whole ? `${s}, ${t('invest.comments.inline.wholeSlide')}` : s
}

function byline(th: DocumentThread) {
  const date = formatDate(th.createdAt, 'short')
  return th.author ? `${th.author.name} · ${date}` : date
}

function send2frame(message: Record<string, unknown>) {
  // A plain copy: postMessage cannot clone Vue's reactive proxies (a thread's point is one).
  props.viewer?.send(JSON.parse(JSON.stringify({ hb: 1, down: 1, ...message })))
}

function hello() {
  send2frame({
    type: 'hello',
    tap: 'always',
    hover: true,
    chip: t('invest.comments.inline.chip'),
    chipStyle: { bg: '#ffffff', fg: '#111111', radius: 4 },
    commenting: props.commenting,
    select: true,
  })
}

// Every thread of the current version that sits on a slide gets a number, oldest first,
// so a marker keeps its number whichever slide is on screen.
const numbered = computed(() =>
  threads.value.filter((th) => !th.withdrawnAt && th.version === version.value && (th.slide || th.anchor)),
)

function pins() {
  if (!ready) return
  const v = props.viewer
  const here = currentSlide()
  const list = numbered.value
    .map((th, i) => ({ th, n: i + 1 }))
    .filter(({ th }) => v?.mode === 'scroll' || !v?.slides.length || th.slide === here)
    .map(({ th, n }) => ({
      id: th.id,
      n,
      block: th.anchor ?? th.slide,
      point: th.target?.point ?? null,
      state: props.comments.answered(th) ? 'answered' : 'open',
      title: th.body.slice(0, 80),
      // Words a reader selected are painted; a tapped block is not.
      exact: th.target && !th.target.level ? th.quote : null,
      prefix: th.target?.prefix ?? '',
      suffix: th.target?.suffix ?? '',
      who: th.author?.name?.trim().charAt(0) || undefined,
    }))
  send2frame({ type: 'pins', pins: list, colors: { bg: '#ffffff', fg: '#111111', done: '#2e7d32', doneFg: '#ffffff' } })
}

watch([threads, () => props.viewer?.at, () => props.viewer?.mode], pins)
watch(
  () => props.commenting,
  (on) => send2frame({ type: 'commenting', on, select: true }),
)

function openNew(d: Draft) {
  error.value = ''
  justSent.value = null
  // Every new comment starts at the default ("bare komiteen"): "alle" chosen once must
  // not carry over to the next thing someone writes.
  visibility.value = props.comments.defaultVisibility.value
  panel.value = { kind: 'new', draft: d }
  nextTick(() => input.value?.focus())
}

/** A thread in the panel, and its block in the deck (on its slide). */
function open(id: string) {
  const th = threads.value.find((x) => x.id === id)
  if (!th) return
  error.value = ''
  replyDraft.value = ''
  replyPublic.value = th.visibility === 'all'
  panel.value = { kind: 'thread', id }
  const slide = th.slide && /^[A-Za-z]/.test(th.slide) ? th.slide : null
  if (slide && slide !== currentSlide()) props.viewer?.showAnchor(slide)
  // After the slide change has drawn its markers.
  setTimeout(
    () => send2frame({ type: 'show', block: th.anchor ?? th.slide, point: th.target?.point ?? null, id: th.id }),
    slide && slide !== currentSlide() ? 250 : 0,
  )
}

function close() {
  panel.value = null
  error.value = ''
  send2frame({ type: 'clear' })
}

/** Every message from the frame (DocumentViewer checked where it came from). */
function onFrame(m: Record<string, unknown>) {
  if (m.hb !== 1) return
  if (m.type === 'ready') {
    // Once, then again only when the frame was loaded anew (the bridge says ready twice).
    if (!ready) hello()
    ready = true
    pins()
  } else if (m.type === 'tap') {
    const page = m.level === 'page' || !m.block
    const point = m.point as Record<string, number> | undefined
    openNew({
      anchor: page ? null : String(m.block),
      slide: currentSlide(),
      quote: page ? null : typeof m.quote === 'string' && m.quote ? m.quote.slice(0, 300) : null,
      target: { level: (m.level as string) || 'block', ...(point ? { point } : {}) },
    })
  } else if (m.type === 'selection') {
    // Open on the chip's press or a held mouse; a selection still being made is not a comment yet.
    if (typeof m.exact !== 'string' || !m.exact.trim() || !(m.chip || m.held)) return
    const point = m.point as Record<string, number> | undefined
    openNew({
      anchor: typeof m.block === 'string' ? m.block : null,
      slide: currentSlide(),
      quote: m.exact.replace(/\s+/g, ' ').trim().slice(0, 300),
      target: {
        ...(typeof m.prefix === 'string' && m.prefix ? { prefix: m.prefix } : {}),
        ...(typeof m.suffix === 'string' && m.suffix ? { suffix: m.suffix } : {}),
        ...(point ? { point } : {}),
      },
    })
  } else if (m.type === 'pin' && typeof m.id === 'string') {
    open(m.id)
  }
}

async function act(id: string, run: () => Promise<unknown>) {
  error.value = ''
  busy.value = id
  try {
    await run()
  } catch (e: any) {
    error.value = props.comments.errorText(e)
  } finally {
    busy.value = null
  }
}

function send() {
  if (panel.value?.kind !== 'new') return
  const d = panel.value.draft
  return act('send', async () => {
    const id = await props.comments.add({
      kind: kind.value,
      visibility: visibility.value,
      body: draft.value,
      anchor: d.anchor,
      slide: d.slide,
      quote: d.quote,
      target: d.target,
      from: 'deck',
    })
    draft.value = ''
    justSent.value = id
    open(id)
  })
}

function reply() {
  const th = thread.value
  if (!th) return
  return act('reply', async () => {
    await props.comments.reply(th.id, replyDraft.value, replyPublic.value)
    replyDraft.value = ''
  })
}

defineExpose({ onFrame, open })
</script>

<style scoped>
.dcl-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  margin: 0;
  padding: 6px 12px;
  border-radius: 4px;
  background: rgba(17, 17, 17, 0.88);
  color: #fff;
  font-size: 13px;
  pointer-events: none;
  z-index: 4;
  white-space: nowrap;
}
.dcl-panel {
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: 8px;
  width: min(380px, calc(100% - 16px));
  overflow-y: auto;
  padding: 12px 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  z-index: 5;
  text-align: left;
}
@media (max-width: 600px) {
  .dcl-panel {
    /* A phone: a sheet from the bottom, the slide still in view above it. */
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 72%;
    border-radius: 8px 8px 0 0;
  }
}
.dcl-title {
  font-size: 1rem;
  font-weight: 650;
  color: #fff;
  margin: 0;
}
.dcl-send {
  background-color: white !important;
  color: #111 !important;
}
.meta {
  color: #999;
  font-size: 13px;
}
.ok-note {
  color: #81c784;
  font-size: 13px;
}
.opt {
  color: #bbb !important;
}
.on {
  background: #fff !important;
  color: #111 !important;
}
.quote {
  color: #bbb;
  font-size: 13px;
  font-style: italic;
  border-left: 2px solid rgba(255, 255, 255, 0.25);
  padding-left: 10px;
  margin: 4px 0 8px;
}
.c-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  margin-bottom: 4px;
}
.gone .c-body,
.c-body.gone {
  color: #777;
  text-decoration: line-through;
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
.reply {
  margin: 8px 0 4px 10px;
  padding-left: 10px;
  border-left: 2px solid rgba(129, 199, 132, 0.5);
}
.reply-by {
  color: #ccc;
  font-weight: 600;
}
</style>
