<template>
  <component :is="c.canOpen ? NuxtLink : 'div'" :to="c.canOpen ? to : undefined" class="case-row" :class="{ quiet }">
    <div class="main">
      <div class="title-line">
        <span class="name">{{ c.name }}</span>
        <span class="state" :class="`state-${tone}`"><span class="dot" aria-hidden="true" />{{ stateLabel }}</span>
      </div>
      <p v-if="c.blurb && !quiet" class="blurb">{{ c.blurb }}</p>
      <p class="meta">{{ metaLine }}</p>
    </div>
    <v-icon v-if="c.canOpen" size="18" class="chevron" aria-hidden="true">mdi-chevron-right</v-icon>
  </component>
</template>

<script setup lang="ts">
// One case in a list (the overview and its sections): name, where it stands, owner
// and last activity. The whole row opens the case; the actions live on the case page.
import { NuxtLink } from '#components'

interface Row {
  slug: string
  name: string
  status: string
  blurb: string | null
  owner: string | null
  lastActivityAt: string | null
  round: { status: string; result: string | null; closesAt: string | null; group: { name: string } } | null
  canOpen: boolean
}

const props = defineProps<{ c: Row; quiet?: boolean; query?: Record<string, string> }>()
const { t, te } = useI18n()
const { formatDate, format } = useLocaleDate()

const to = computed(() => ({ path: `/member/caser/${props.c.slug}`, query: props.query }))

const openVote = computed(() => props.c.round?.status === 'open')

const stateLabel = computed(() => {
  const r = props.c.round
  if (openVote.value && r?.closesAt) {
    return t('deals.round.openUntil', {
      when: format(r.closesAt, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    })
  }
  const s = props.c.status
  return te(`deals.status.${s}`) ? t(`deals.status.${s}`) : s
})

// One colour per kind of state, from the palette the chips already use.
const tone = computed(() => {
  if (openVote.value) return 'open'
  if (props.c.status === 'pending_transfer' || props.c.status === 'invested') return 'done'
  if (props.c.status === 'to_be_voted') return 'open'
  return 'neutral'
})

const metaLine = computed(() => {
  const parts = []
  if (props.c.owner) parts.push(t('deals.case.owner', { name: props.c.owner }))
  if (props.c.lastActivityAt)
    parts.push(t('deals.list.lastActivity', { date: formatDate(props.c.lastActivityAt, 'short') }))
  return parts.join(' · ')
})
</script>

<style scoped>
.case-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: #fff;
  text-decoration: none;
  min-height: 56px;
  transition: background-color 0.15s ease;
}
.case-row + .case-row {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
a.case-row:hover,
a.case-row:focus-visible {
  background: rgba(255, 255, 255, 0.05);
}
a.case-row:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: -2px;
}
.main {
  flex: 1;
  min-width: 0;
}
.title-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 12px;
  row-gap: 2px;
}
.name {
  font-size: 1rem;
  font-weight: 600;
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #b5b5b5;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #777;
  flex: none;
}
.state-open {
  color: #ffb74d;
}
.state-open .dot {
  background: #ff9800;
}
.state-done .dot {
  background: #4caf50;
}
.blurb {
  color: #cfcfcf;
  font-size: 14px;
  line-height: 1.5;
  margin: 4px 0 0;
  max-width: 68ch;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  color: #999;
  font-size: 13px;
  margin: 3px 0 0;
}
.chevron {
  color: #777;
  flex: none;
}
a.case-row:hover .chevron {
  color: #fff;
}
.quiet .name {
  font-weight: 500;
  color: #ddd;
}
</style>
