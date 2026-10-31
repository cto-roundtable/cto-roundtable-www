<template>
  <div
    ref="root"
    class="dv"
    :class="{ 'dv-full': full, 'dv-overlay': full && !nativeFull }"
    tabindex="-1"
    @keydown="onKey"
  >
    <div class="dv-bar">
      <template v-if="slides.length >= 2">
        <v-btn
          icon="mdi-chevron-left"
          variant="text"
          size="small"
          :disabled="at <= 0"
          :aria-label="t('documentViewer.previous')"
          @click="go(at - 1)"
        />
        <v-menu location="bottom">
          <template #activator="{ props: menu }">
            <button v-bind="menu" type="button" class="dv-counter" :aria-label="t('documentViewer.jump')">
              {{ t('documentViewer.counter', { n: at + 1, count: slides.length }) }}
            </button>
          </template>
          <v-list density="compact" theme="dark" class="dv-list">
            <v-list-item v-for="(s, i) in slides" :key="i" :active="i === at" @click="go(i)">
              <v-list-item-title>{{ i + 1 }}. {{ s.title || t('documentViewer.untitled') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-btn
          icon="mdi-chevron-right"
          variant="text"
          size="small"
          :disabled="at >= slides.length - 1"
          :aria-label="t('documentViewer.next')"
          @click="go(at + 1)"
        />
        <v-btn
          :icon="mode === 'slides' ? 'mdi-view-agenda-outline' : 'mdi-presentation'"
          variant="text"
          size="small"
          :title="mode === 'slides' ? t('documentViewer.scrollMode') : t('documentViewer.slideMode')"
          :aria-label="mode === 'slides' ? t('documentViewer.scrollMode') : t('documentViewer.slideMode')"
          @click="setMode(mode === 'slides' ? 'scroll' : 'slides')"
        />
      </template>
      <v-spacer />
      <slot name="toolbar" />
      <v-btn
        v-if="!full"
        :href="src"
        target="_blank"
        rel="noopener"
        icon="mdi-open-in-new"
        variant="text"
        size="small"
        :title="t('documentViewer.newTab')"
        :aria-label="t('documentViewer.newTab')"
      />
      <v-btn
        :icon="full ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
        variant="text"
        size="small"
        :title="full ? t('documentViewer.exitFull') : t('documentViewer.full')"
        :aria-label="full ? t('documentViewer.exitFull') : t('documentViewer.full')"
        @click="toggleFull"
      />
    </div>

    <div class="dv-stage">
      <v-alert v-if="failed" type="warning" variant="outlined" class="ma-4">{{ t('documentViewer.failed') }}</v-alert>
      <!-- An HTML document: our copy of it with the viewer's script, in an opaque origin
           (no allow-same-origin), so it can run that script and still not reach the
           portal's cookies or API. Anything else: the API's own response, as before. -->
      <iframe
        v-else-if="srcdoc"
        ref="frame"
        :srcdoc="srcdoc"
        :title="title"
        class="dv-frame"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
      />
      <iframe
        v-else-if="plain"
        :src="src"
        :title="title"
        class="dv-frame"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
      />
      <div v-else class="dv-loading">
        <v-progress-circular indeterminate size="28" color="white" />
      </div>
      <slot name="overlay" />
    </div>
  </div>
</template>

<script setup lang="ts">
// A document from the portal's API in a frame, one slide at a time when it has slides:
// prev/next (buttons, arrow keys, a swipe), a counter that jumps, a full view, and links
// that open in a new tab. The frame's half is app/utils/documentFrame.ts. Reusable: the
// page gives it the document's URL and nothing else.
import type { FrameSlide, FromDocumentFrame, ToDocumentFrame } from '~/utils/documentFrame'

const props = withDefaults(
  defineProps<{
    /** The document's URL on the portal's API (it answers with the stored bytes). */
    src: string
    title?: string
    /** Start one slide at a time, when the document has slides. */
    slides?: boolean
    /** More scripts to run in the frame, after the viewer's own (the comment bridge). */
    scripts?: string[]
  }>(),
  { title: '', slides: true, scripts: () => [] },
)

const emit = defineEmits<{
  /** Every message from the frame, for whatever is laid over it (comments). */
  message: [data: Record<string, unknown>]
  at: [index: number]
}>()

const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const srcdoc = ref('')
const plain = ref(false)
const failed = ref(false)
const slides = ref<FrameSlide[]>([])
const at = ref(0)
const mode = ref<'slides' | 'scroll'>('scroll')
const full = ref(false)
const nativeFull = ref(false)
const ready = ref(false)
// An anchor asked for before the frame was ready.
let pendingAnchor: string | null = null

function post(message: Omit<ToDocumentFrame, 'dv'> | Record<string, unknown>) {
  send({ dv: 1, ...message })
}

/** A message to the frame as it is (another script's protocol: the comment bridge). */
function send(message: Record<string, unknown>) {
  frame.value?.contentWindow?.postMessage(message, '*')
}

function go(index: number) {
  post({ type: 'goto', index })
}

function setMode(next: 'slides' | 'scroll') {
  mode.value = next
  post({ type: 'mode', slides: next === 'slides' })
}

/** Show the element with this id (a slide: slide-4), and the viewer with it. */
function showAnchor(id: string) {
  root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (ready.value) post({ type: 'anchor', id })
  else pendingAnchor = id
}

async function load() {
  failed.value = false
  ready.value = false
  srcdoc.value = ''
  plain.value = false
  try {
    const res = await fetch(props.src, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(String(res.status))
    if (!/^text\/html\b/i.test(res.headers.get('content-type') ?? '')) {
      plain.value = true
      return
    }
    const html = await res.text()
    srcdoc.value = withDocumentFrame(
      html,
      { slides: props.slides, start: 0, base: window.location.origin },
      crypto.randomUUID().replace(/-/g, ''),
      props.scripts,
    )
  } catch {
    failed.value = true
  }
}

function onMessage(e: MessageEvent) {
  if (!frame.value || e.source !== frame.value.contentWindow) return
  const d = e.data as FromDocumentFrame | null
  if (!d || typeof d !== 'object') return
  emit('message', d as unknown as Record<string, unknown>)
  if (d.dv !== 1) return
  if (d.type === 'ready') {
    ready.value = true
    slides.value = d.slides
    at.value = d.index
    mode.value = d.mode
    if (pendingAnchor) {
      post({ type: 'anchor', id: pendingAnchor })
      pendingAnchor = null
    }
  } else if (d.type === 'at') {
    at.value = d.index
    emit('at', d.index)
  } else if (d.type === 'key' && d.key === 'Escape' && full.value) {
    toggleFull()
  }
}

// Keys while the focus is on the viewer but not in the frame (the toolbar, or the page
// in full view); in the frame, the frame's own script has them.
function onKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (e.key === 'Escape' && full.value) toggleFull()
  else if (mode.value !== 'slides') return
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') go(at.value + 1)
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(at.value - 1)
  else return
  e.preventDefault()
}

// Full view: the browser's fullscreen where there is one; on an iPhone (no element
// fullscreen) the viewer covers the page instead.
async function toggleFull() {
  if (full.value) {
    if (nativeFull.value && document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    full.value = false
    nativeFull.value = false
    return
  }
  full.value = true
  if (root.value?.requestFullscreen && document.fullscreenEnabled) {
    try {
      await root.value.requestFullscreen()
      nativeFull.value = true
    } catch {
      nativeFull.value = false
    }
  }
  root.value?.focus()
}

function onFullscreenChange() {
  // Left with the browser's own Escape or gesture.
  if (nativeFull.value && !document.fullscreenElement) {
    full.value = false
    nativeFull.value = false
  }
}

// The covering view must not leave the page behind it scrolling.
watch(
  () => full.value && !nativeFull.value,
  (covering) => {
    document.documentElement.style.overflow = covering ? 'hidden' : ''
  },
)

onMounted(() => {
  window.addEventListener('message', onMessage)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.documentElement.style.overflow = ''
})
watch(() => props.src, load)

defineExpose({ showAnchor, go, post, send, slides, at, mode })
</script>

<style scoped>
.dv {
  /* "Show the slide" scrolls the viewer into view: keep it clear of the fixed app bar. */
  scroll-margin-top: 64px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: #111;
  outline: none;
}
.dv-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  color: #ccc;
}
.dv-counter {
  min-width: 64px;
  padding: 4px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.dv-counter:hover,
.dv-counter:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.dv-list {
  max-height: 60vh;
}
.dv-stage {
  position: relative;
  height: min(78vh, 760px);
  min-height: 420px;
}
.dv-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.dv-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.dv-full {
  border: 0;
  border-radius: 0;
}
.dv-full .dv-stage {
  flex: 1;
  height: auto;
  min-height: 0;
}
:fullscreen.dv {
  width: 100vw;
  height: 100vh;
}
.dv-overlay {
  position: fixed;
  inset: 0;
  z-index: 2400;
  height: 100dvh;
}
@media (max-width: 600px) {
  .dv-stage {
    /* A phone: the viewer fills what the app bar and the toolbar leave. */
    height: calc(100dvh - 64px - 48px - 24px);
    min-height: 360px;
  }
}
</style>
