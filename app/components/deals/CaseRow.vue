<template>
  <div class="row-wrap">
  <component :is="c.canOpen ? NuxtLink : 'div'" :to="c.canOpen ? to : undefined" class="case-row" :class="{ quiet }">
    <div class="main">
      <div class="title-line">
        <span class="name">{{ c.name }}</span>
        <span class="state" :class="`state-${tone}`"><span class="dot" aria-hidden="true" />{{ stateLabel }}</span>
        <template v-if="invested">
          <span v-for="g in c.spvs" :key="g.slug" class="spv">{{ g.name }}</span>
        </template>
      </div>
      <p v-if="c.blurb && !quiet" class="blurb">{{ c.blurb }}</p>
      <p class="meta">{{ metaLine }}</p>
    </div>
    <v-icon v-if="c.canOpen" size="18" class="chevron" aria-hidden="true">mdi-chevron-right</v-icon>
  </component>
  <!-- Invested: straight to the company's investor updates (its own page). -->
  <NuxtLink
    v-if="invested && c.spvs?.length"
    :to="`/member/updates/${c.slug}`"
    class="updates"
    :aria-label="t('deals.list.updatesAria', { name: c.name })"
  >
    <v-icon size="16" aria-hidden="true">mdi-finance</v-icon><span class="updates-text">{{ t('deals.list.updates') }}</span>
  </NuxtLink>
  </div>
</template>

<script setup lang="ts">
// One case in a list (the overview and its sections): name, where it stands, ansvarlig
// (lead, then co-leads) and a date. An invested company also carries the viewer's SPVs
// that invested in it and when. The whole row opens the case; the actions live there.
import { NuxtLink } from '#components'

interface Row {
  slug: string
  name: string
  status: string
  blurb: string | null
  owner: string | null
  coLeads?: string[]
  lastActivityAt: string | null
  round: { status: string; result: string | null; closesAt: string | null; group: { name: string } } | null
  spvs?: { slug: string; name: string }[]
  investedAt?: string | null
  canOpen: boolean
}

const props = defineProps<{ c: Row; quiet?: boolean; invested?: boolean }>()
const { t, te } = useI18n()
const { formatDate, format } = useLocaleDate()

const to = computed(() => `/member/caser/${props.c.slug}`)

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
  const drivers = [props.c.owner, ...(props.c.coLeads ?? [])].filter(Boolean)
  if (drivers.length) parts.push(t('deals.case.owner', { name: drivers.join(', ') }))
  if (props.invested && props.c.investedAt)
    parts.push(t('deals.list.investedAt', { date: formatDate(props.c.investedAt, 'short') }))
  else if (props.c.lastActivityAt)
    parts.push(t('deals.list.lastActivity', { date: formatDate(props.c.lastActivityAt, 'short') }))
  return parts.join(' · ')
})
</script>

<style scoped>
.row-wrap {
  display: flex;
  align-items: stretch;
}
.row-wrap + .row-wrap {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.updates {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 0 16px;
  min-width: 48px;
  color: #ccc;
  font-size: 13px;
  text-decoration: none;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  transition: background-color 0.15s ease;
}
.updates:hover,
.updates:focus-visible {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}
.updates:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: -2px;
}
@media (max-width: 520px) {
  .updates-text {
    display: none;
  }
}
.case-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: #fff;
  text-decoration: none;
  min-height: 56px;
  transition: background-color 0.15s ease;
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
.spv {
  font-size: 12px;
  font-weight: 500;
  color: #ddd;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 1px 9px;
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
