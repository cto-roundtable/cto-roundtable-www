<template>
  <div class="meeting-doc">
    <!-- Everything above the first heading: date, location, the odd warning
         blockquote. Short, and it is the context for the rest, so it stays open. -->
    <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes first and only emits its own tags -->
    <div v-if="outline.preamble" class="doc preamble" v-html="renderedPreamble" />

    <div class="toolbar">
      <button type="button" class="link-btn" @click="setAll(true)">Vis alt</button>
      <span class="sep">/</span>
      <button type="button" class="link-btn" @click="setAll(false)">Skjul alt</button>
      <span v-if="totalMinutes" class="total">{{ totalMinutes }} min satt av</span>
    </div>

    <section v-for="s in outline.sections" :key="s.id" class="section">
      <button
        type="button"
        class="head head-2"
        :aria-expanded="isOpen(s.id)"
        @click="toggle(s.id)"
      >
        <span class="chev" :class="{ 'chev-open': isOpen(s.id) }">›</span>
        <span class="head-title">{{ s.title }}</span>
        <span v-if="!isOpen(s.id) && s.children.length" class="count">
          {{ s.children.length }}
        </span>
        <span v-if="s.meta" class="badge">{{ s.meta }}</span>
      </button>

      <div v-show="isOpen(s.id)" class="section-body">
        <!-- eslint-disable-next-line vue/no-v-html -- see above -->
        <div v-if="s.body" class="doc" v-html="html(s.id, s.body)" />

        <div v-for="c in s.children" :key="c.id" class="item">
          <button
            type="button"
            class="head head-3"
            :aria-expanded="isOpen(c.id)"
            @click="toggle(c.id)"
          >
            <span class="chev" :class="{ 'chev-open': isOpen(c.id) }">›</span>
            <span class="head-title">{{ c.title }}</span>
            <span v-if="c.meta" class="badge">{{ c.meta }}</span>
          </button>
          <!-- eslint-disable-next-line vue/no-v-html -- see above -->
          <div v-show="isOpen(c.id)" class="doc item-body" v-html="html(c.id, c.body)" />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ markdown: string }>()

const outline = computed(() => outlineMarkdown(props.markdown))

const renderedPreamble = computed(() => renderMarkdown(outline.value.preamble, { headings: 'levels' }))

// Bodies are rendered on first open and kept, so expanding is instant on the
// second visit without paying for the whole 13k document up front.
const cache = new Map<string, string>()
function html(id: string, md: string): string {
  const hit = cache.get(id)
  if (hit !== undefined) return hit
  const out = renderMarkdown(md, { headings: 'levels' })
  cache.set(id, out)
  return out
}

const open = ref<Record<string, boolean>>({})

/**
 * Default state, which is the whole point of this component: a section that
 * holds saker opens so you can see the list of them, and every sak inside it
 * starts closed. A section that is content rather than a container (Til stede,
 * Vedtak, Referanser) starts closed too. So the first screen is the agenda,
 * not the agenda's text.
 */
function defaults() {
  const next: Record<string, boolean> = {}
  for (const s of outline.value.sections) {
    next[s.id] = s.children.length > 0
    for (const c of s.children) next[c.id] = false
  }
  open.value = next
}

watch(() => props.markdown, defaults, { immediate: true })

function isOpen(id: string): boolean {
  return open.value[id] === true
}

function toggle(id: string) {
  open.value = { ...open.value, [id]: !open.value[id] }
}

function setAll(value: boolean) {
  const next: Record<string, boolean> = {}
  for (const s of outline.value.sections) {
    next[s.id] = value
    for (const c of s.children) next[c.id] = value
  }
  open.value = next
}

// How much of the meeting the saker actually account for. Useful when the slot
// is two hours and the agenda quietly adds up to more.
const totalMinutes = computed(() => {
  let sum = 0
  for (const s of outline.value.sections) {
    sum += s.minutes ?? 0
    for (const c of s.children) sum += c.minutes ?? 0
  }
  return sum
})
</script>

<style scoped>
/* Rendered-markdown styling. It lives here rather than on the page because the
   markdown is emitted here, and scoped styles only reach their own component. */
.doc {
  color: #ddd;
  font-size: 14px;
  line-height: 1.7;
}

.doc :deep(h2),
.doc :deep(h3) {
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  margin: 1.2rem 0 0.5rem;
}

.doc :deep(h4),
.doc :deep(h5) {
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
  margin: 1rem 0 0.4rem;
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
  margin: 1.4rem 0;
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

.preamble {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 14px;
  padding-bottom: 6px;
}

.toolbar {
  align-items: center;
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.link-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 0;
}

.link-btn:hover {
  color: #fff;
  text-decoration: underline;
}

.sep {
  color: #555;
  font-size: 12px;
}

.total {
  color: #666;
  font-size: 12px;
  margin-left: auto;
}

.section {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.section:last-child {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.head {
  align-items: baseline;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 12px 2px;
  text-align: left;
  width: 100%;
}

.head:hover {
  color: #fff;
}

.head:hover .head-title {
  text-decoration: underline;
}

.head-2 .head-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.head-3 {
  padding: 9px 2px;
}

.head-3 .head-title {
  color: #ddd;
  font-size: 0.95rem;
  font-weight: 600;
}

.head-title {
  flex: 1;
}

/* A right-pointing chevron that turns down when open: the one affordance that
   tells you the row is a door and not a heading. */
.chev {
  color: #777;
  display: inline-block;
  flex: none;
  font-size: 16px;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.15s ease;
  width: 10px;
}

.chev-open {
  transform: rotate(90deg);
}

.count {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  color: #888;
  flex: none;
  font-size: 11px;
  padding: 1px 7px;
}

.badge {
  color: #888;
  flex: none;
  font-size: 11px;
  white-space: nowrap;
}

.section-body {
  padding: 0 0 10px 20px;
}

.item {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.item:first-child {
  border-top: none;
}

.item-body {
  padding: 0 0 12px 20px;
}

@media (max-width: 600px) {
  .section-body,
  .item-body {
    padding-left: 10px;
  }
}
</style>
