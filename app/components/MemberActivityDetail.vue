<template>
  <div class="activity-detail">
    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="white" />
    </div>

    <div v-else-if="error" style="color: #ef9a9a; font-size: 14px;">
      Kunne ikke laste aktivitet.
    </div>

    <template v-else-if="data">
      <!-- Header -->
      <div class="d-flex align-center mb-1" style="gap: 10px; flex-wrap: wrap;">
        <h2 class="font-weight-bold mb-0" style="font-size: 1.3rem;">{{ data.name }}</h2>
        <v-chip
          v-if="data.status"
          :color="statusColor(data.status)"
          variant="flat"
          size="x-small"
          class="text-uppercase font-weight-bold"
          style="letter-spacing: 0.04em;"
        >
          {{ statusLabel(data.status) }}
        </v-chip>
      </div>
      <p style="color: #888; font-size: 12.5px;" class="mb-4">
        Score {{ data.score }} · aktiv {{ formatDate(data.firstSeen) }} til {{ formatDate(data.lastSeen) }}
        · siste {{ Math.round(data.windowDays / 30) }} mnd
      </p>

      <!-- Score breakdown tiles -->
      <div class="tiles mb-5">
        <div v-for="t in tiles" :key="t.key" class="tile">
          <div class="tile-count">{{ t.count }}</div>
          <div class="tile-label">{{ t.label }}</div>
          <div class="tile-points">{{ t.points }} p</div>
        </div>
      </div>

      <!-- Weekly activity chart -->
      <div class="section-head">Aktivitet per uke</div>
      <div v-if="hasWeeklyData" class="chart mb-2">
        <div
          v-for="(w, i) in data.weekly"
          :key="i"
          class="bar-col"
          :title="barTitle(w)"
        >
          <div class="bar">
            <div class="seg seg-reactions" :style="segStyle(w.reactions)" />
            <div class="seg seg-replies" :style="segStyle(w.replies)" />
            <div class="seg seg-posts" :style="segStyle(w.posts)" />
          </div>
        </div>
      </div>
      <p v-else style="color: #777; font-size: 12.5px;" class="mb-2">Ingen Slack-aktivitet i vinduet.</p>
      <div class="legend mb-1">
        <span><i class="dot seg-posts" /> post</span>
        <span><i class="dot seg-replies" /> tråd-svar</span>
        <span><i class="dot seg-reactions" /> reaksjon</span>
        <span class="ml-auto">{{ data.messagesPerActiveWeek }} meldinger / aktiv uke</span>
      </div>

      <div class="grid mt-5">
        <!-- Events -->
        <div>
          <div class="section-head">Eventer ({{ data.events.length }})</div>
          <ul v-if="data.events.length" class="plain">
            <li v-for="(e, i) in data.events" :key="i" class="d-flex align-center" style="gap: 8px;">
              <v-icon size="14" :color="e.role === 'hosted' ? '#ffb74d' : '#90caf9'">
                {{ e.role === 'hosted' ? 'mdi-account-star' : 'mdi-check-circle-outline' }}
              </v-icon>
              <span class="flex-grow-1">{{ e.title }}</span>
              <span style="color: #777; font-size: 12px; white-space: nowrap;">{{ formatDate(e.at) }}</span>
            </li>
          </ul>
          <p v-else style="color: #777; font-size: 12.5px;">Ingen registrerte eventer.</p>
        </div>

        <!-- Received engagement + channels -->
        <div>
          <div class="section-head">Reaksjoner mottatt</div>
          <div class="d-flex align-center mb-4" style="gap: 10px; flex-wrap: wrap;">
            <span class="font-weight-bold" style="font-size: 1.4rem;">{{ data.reactionsReceived }}</span>
            <span v-if="data.topEmojis.length" style="color: #aaa; font-size: 13px;">
              <template v-for="em in data.topEmojis" :key="em.emoji">:{{ em.emoji }}: {{ em.n }} </template>
            </span>
          </div>

          <div class="section-head">Mest aktiv i</div>
          <div class="d-flex flex-wrap" style="gap: 6px;">
            <v-chip v-for="c in data.topChannels" :key="c.name" variant="outlined" size="small">
              #{{ c.name }} · {{ c.n }}
            </v-chip>
            <span v-if="!data.topChannels.length" style="color: #777; font-size: 12.5px;">Ingen kanaler.</span>
          </div>
        </div>
      </div>

      <p style="color: #666; font-size: 11.5px;" class="mt-5 mb-0">{{ data.coverageNote }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ personId: string; context?: 'self' | 'board' }>()

const loading = ref(true)
const error = ref(false)
const data = ref<any>(null)

async function load() {
  if (!props.personId) return
  loading.value = true
  error.value = false
  try {
    const view = props.context === 'board' ? '&view=board' : ''
    data.value = await $fetch(`/api/member/activity/${props.personId}?days=365${view}`)
  } catch {
    error.value = true
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.personId, load, { immediate: true })

const tiles = computed(() => {
  if (!data.value) return []
  const b = data.value.breakdown
  const p = data.value.points
  return [
    { key: 'posts', label: 'poster', count: b.posts, points: p.posts },
    { key: 'replies', label: 'tråd-svar', count: b.replies, points: p.replies },
    { key: 'reactions', label: 'reaksjoner', count: b.reactions, points: p.reactions },
    { key: 'attended', label: 'oppmøte', count: b.attended, points: p.attended },
    { key: 'hosted', label: 'hosting', count: b.hosted, points: p.hosted },
  ]
})

const maxWeekTotal = computed(() => {
  if (!data.value) return 1
  return Math.max(1, ...data.value.weekly.map((w: any) => w.posts + w.replies + w.reactions))
})
const hasWeeklyData = computed(() => maxWeekTotal.value > 1 || (data.value && data.value.messages > 0))

function segStyle(n: number) {
  const h = (n / maxWeekTotal.value) * 100
  return { height: `${h}%` }
}
function barTitle(w: any) {
  return `${formatDate(w.week)}: ${w.posts} post, ${w.replies} svar, ${w.reactions} reaksjon`
}

function statusColor(s: string): string {
  return { active: '#4caf50', low: '#ff9800', dormant: '#ef5350' }[s] || '#9e9e9e'
}
function statusLabel(s: string): string {
  return { active: 'Aktiv', low: 'Lav', dormant: 'Sovende' }[s] || s
}
function formatDate(d: string | null): string {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.activity-detail {
  color: #fff;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
@media (max-width: 560px) {
  .tiles {
    grid-template-columns: repeat(3, 1fr);
  }
}
.tile {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 8px;
  text-align: center;
}
.tile-count {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.1;
}
.tile-label {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 2px;
}
.tile-points {
  font-size: 11px;
  color: #7e57c2;
  margin-top: 3px;
  font-weight: 600;
}
.section-head {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #888;
  margin-bottom: 8px;
}
.chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 72px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.bar-col {
  flex: 1 1 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
}
.bar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 2px;
}
.seg {
  width: 100%;
}
.seg-posts {
  background: #7e57c2;
}
.seg-replies {
  background: #42a5f5;
}
.seg-reactions {
  background: #66bb6a;
}
.legend {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: #aaa;
  flex-wrap: wrap;
}
.legend .dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  margin-right: 4px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}
.plain {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13.5px;
}
</style>
