<template>
  <component
    :is="c.slug ? NuxtLink : 'div'"
    :to="c.slug ? `/member/caser/${c.slug}` : undefined"
    class="no-row"
    :class="{ ticket }"
  >
    <div class="main">
      <div class="title-line">
        <span class="name">{{ c.name }}</span>
        <span class="state"><span class="dot" aria-hidden="true" />{{ t(`deals.status.${c.status}`) }}</span>
        <span v-if="c.category" class="category" :class="{ 'category-ticket': ticket }">
          <v-icon v-if="ticket" size="14" aria-hidden="true">mdi-cash-multiple</v-icon>
          {{ t(`deals.noes.category.${c.category}`) }}
        </span>
      </div>
      <p v-if="c.reason" class="reason">{{ c.reason }}</p>
      <p class="meta">{{ metaLine }}</p>
    </div>
    <v-icon v-if="c.slug" size="18" class="chevron" aria-hidden="true">mdi-chevron-right</v-icon>
  </component>
</template>

<script setup lang="ts">
// One no (the no list, and the newest on the overview): name, Avslått or Gikk glipp av,
// why it ended (a ticket-size no is marked so it cannot be missed), the reason line, the
// year and ansvarlig. It links only when the viewer can open the case (slug set).
import { NuxtLink } from '#components'
import type { NoRow } from '~/utils/noList'

const props = defineProps<{ c: NoRow }>()
const { t } = useI18n()

const ticket = computed(() => props.c.category === 'ticket_size')

const metaLine = computed(() => {
  const year = yearOf(props.c)
  const parts = [props.c.decidedKnown ? year : t('deals.noes.cameIn', { year })]
  const drivers = [props.c.owner, ...props.c.coLeads].filter(Boolean)
  if (drivers.length) parts.push(t('deals.case.owner', { name: drivers.join(', ') }))
  return parts.join(' · ')
})
</script>

<style scoped>
.no-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: #fff;
  text-decoration: none;
  min-height: 56px;
  border-left: 3px solid transparent;
  transition: background-color 0.15s ease;
}
.no-row + .no-row {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.no-row.ticket {
  border-left-color: #ffb74d;
  background: rgba(255, 183, 77, 0.06);
}
a.no-row:hover,
a.no-row:focus-visible {
  background: rgba(255, 255, 255, 0.05);
}
a.no-row:focus-visible {
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
  row-gap: 4px;
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
.category {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #ddd;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 1px 9px;
}
.category-ticket {
  color: #111;
  background: #ffb74d;
  font-weight: 650;
}
.reason {
  color: #cfcfcf;
  font-size: 14px;
  line-height: 1.5;
  margin: 4px 0 0;
  max-width: 68ch;
}
.meta {
  color: #999;
  font-size: 13px;
  margin: 4px 0 0;
}
.chevron {
  color: #888;
  flex: none;
}
</style>
