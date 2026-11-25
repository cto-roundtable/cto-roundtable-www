<template>
  <div class="activity text-left">
    <header class="mb-6">
      <div class="d-flex align-center mb-2" style="gap: 12px;">
        <h1 class="font-weight-bold mb-0" style="font-size: 1.6rem;">Medlemmer og aktivitet</h1>
        <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
          Kun for styret
        </v-chip>
      </div>
      <p style="color: #aaa; font-size: 14px;">
        Hvem som er pensjonert og når, hvem som sitter i styret, komiteen og CTORI, og
        medlemsaktivitet fra Slack (meldinger + reaksjoner) og Luma (oppmøte + hosting).
        Aktive medlemmer er sortert med de minst aktive øverst, for å flagge inaktive.
      </p>
    </header>

    <!-- Not authorized (defensive: the nav link is board-only anyway) -->
    <div v-if="forbidden" style="color: #aaa;">
      Denne siden er kun for styret.
    </div>

    <template v-else>
      <!-- Search and filters: narrow both lists (pensjonister and active) at once. -->
      <v-text-field
        v-model="search"
        placeholder="Søk på navn eller rolle (Styret, Komité, CTORI 3 …)"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        clearable
        hide-details
        class="mb-3"
        style="max-width: 520px;"
      />
      <div class="d-flex align-center mb-2" style="gap: 8px; flex-wrap: wrap;">
        <span style="color: #888; font-size: 13px;">Vis:</span>
        <v-chip
          v-for="opt in showOptions"
          :key="opt.value"
          :variant="show === opt.value ? 'flat' : 'outlined'"
          :color="show === opt.value ? 'white' : undefined"
          size="small"
          @click="show = opt.value"
        >
          {{ opt.title }}
        </v-chip>
      </div>
      <div v-if="roleOptions.length" class="d-flex align-center mb-2" style="gap: 8px; flex-wrap: wrap;">
        <span style="color: #888; font-size: 13px;">Rolle:</span>
        <v-chip
          :variant="role === null ? 'flat' : 'outlined'"
          :color="role === null ? 'white' : undefined"
          size="small"
          @click="role = null"
        >
          Alle
        </v-chip>
        <v-chip
          v-for="r in roleOptions"
          :key="r"
          :variant="role === r ? 'flat' : 'outlined'"
          :color="role === r ? 'white' : undefined"
          size="small"
          @click="role = role === r ? null : r"
        >
          {{ r }}
        </v-chip>
      </div>

      <!-- Chapter: Norway and the Swedish chapter run separately (vedtak 6), so
           they are counted apart. Norway is the default. -->
      <div class="d-flex align-center mb-2" style="gap: 8px; flex-wrap: wrap;">
        <span style="color: #888; font-size: 13px;">Avdeling:</span>
        <v-chip
          v-for="opt in chapterOptions"
          :key="opt.value"
          :variant="chapter === opt.value ? 'flat' : 'outlined'"
          :color="chapter === opt.value ? 'white' : undefined"
          size="small"
          @click="setChapter(opt.value)"
        >
          {{ opt.title }}
        </v-chip>
      </div>

      <!-- Window selector -->
      <div class="d-flex align-center mb-4" style="gap: 8px; flex-wrap: wrap;">
        <span style="color: #888; font-size: 13px;">Vindu:</span>
        <v-chip
          v-for="opt in windowOptions"
          :key="opt"
          :variant="days === opt ? 'flat' : 'outlined'"
          :color="days === opt ? 'white' : undefined"
          size="small"
          @click="setDays(opt)"
        >
          {{ opt }} dager
        </v-chip>
        <v-spacer />
        <v-switch
          v-model="onlyFlagged"
          label="Kun flagget"
          color="white"
          density="compact"
          hide-details
          inset
        />
      </div>

      <div v-if="loading" class="d-flex justify-center py-10">
        <v-progress-circular indeterminate color="white" />
      </div>

      <template v-else-if="data">
        <!-- Summary -->
        <div class="d-flex mb-4" style="gap: 10px; flex-wrap: wrap;">
          <v-chip variant="outlined" size="small">{{ data.summary.total }} aktive medlemmer</v-chip>
          <v-chip color="#4caf50" variant="flat" size="small">{{ data.summary.active }} aktive</v-chip>
          <v-chip color="#ff9800" variant="flat" size="small">{{ data.summary.low }} lav</v-chip>
          <v-chip color="#ef5350" variant="flat" size="small">{{ data.summary.dormant }} sovende</v-chip>
          <v-chip color="#9e9e9e" variant="flat" size="small">{{ data.summary.retired }} pensjonert</v-chip>
          <v-chip v-if="data.summary.otherStatus" color="#9e9e9e" variant="outlined" size="small">
            {{ data.summary.otherStatus }} annen status
          </v-chip>
        </div>

        <!-- Not active, first: who has retired and when. Newest retirement on top. -->
        <template v-if="show !== 'active'">
        <h2 class="section-title">
          Pensjonert
          <span v-if="filtering" class="section-count">{{ visibleFormer.length }} av {{ data.former.length }}</span>
        </h2>
        <p v-if="!data.former.length" style="color: #888; font-size: 13px;" class="mb-6">
          Ingen pensjonerte i denne avdelingen.
        </p>
        <p v-else-if="!visibleFormer.length" style="color: #888; font-size: 13px;" class="mb-6">
          Ingen treff blant pensjonerte.
        </p>
        <v-table v-else density="comfortable" class="activity-table mb-8">
          <thead>
            <tr>
              <th>Medlem</th>
              <th>Pensjonert</th>
              <th class="d-none d-sm-table-cell">Medlem siden</th>
              <th class="d-none d-md-table-cell">Sist aktiv</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in visibleFormer" :key="f.personId" class="row-click" @click="openDetail(f)">
              <td>
                <div>{{ f.name }}</div>
                <div class="d-flex mt-1" style="gap: 4px; flex-wrap: wrap;">
                  <v-chip v-if="f.personStatus !== 'retired'" size="x-small" variant="outlined">
                    {{ personStatusLabel(f.personStatus) }}
                  </v-chip>
                  <v-chip v-for="r in f.roles" :key="r" size="x-small" variant="outlined" class="role-chip">{{ r }}</v-chip>
                  <v-chip v-if="f.rejoinRequestedAt" size="x-small" color="#4caf50" variant="flat">
                    Søkt om å komme tilbake {{ formatDate(f.rejoinRequestedAt) }}
                  </v-chip>
                </div>
              </td>
              <td style="white-space: nowrap;">
                <template v-if="f.retiredAt">
                  {{ formatDate(f.retiredAt) }}
                  <div style="color: #888; font-size: 12px;">{{ ago(f.retiredAt) }}</div>
                </template>
                <span v-else style="color: #888;">–</span>
              </td>
              <td class="d-none d-sm-table-cell" style="color: #aaa;">{{ formatJoined(f.joinedAt) }}</td>
              <td class="d-none d-md-table-cell" style="color: #aaa;">{{ f.lastEver ? formatDate(f.lastEver) : 'aldri' }}</td>
            </tr>
          </tbody>
        </v-table>
        </template>

        <template v-if="show !== 'retired'">
        <h2 class="section-title">
          Aktive medlemmer
          <span v-if="filtering" class="section-count">{{ visibleMembers.length }} av {{ data.members.length }}</span>
        </h2>

        <v-alert type="info" variant="tonal" density="compact" class="mb-4" style="font-size: 12.5px;">
          {{ data.coverageNote }}
        </v-alert>

        <p v-if="!visibleMembers.length" style="color: #888; font-size: 13px;">
          Ingen treff blant aktive medlemmer.
        </p>
        <v-table v-else density="comfortable" class="activity-table">
          <thead>
            <tr>
              <th>Medlem</th>
              <th>Status</th>
              <th class="d-none d-md-table-cell">Medlem siden</th>
              <th class="text-right">Poster</th>
              <th class="text-right">Oppmøte</th>
              <th class="text-right">Hosting</th>
              <th class="text-right">Score</th>
              <th class="d-none d-sm-table-cell">Sist sett</th>
              <th class="text-right d-none d-sm-table-cell" title="Innloggede sidevisninger i portalen i vinduet (samme side innen 10 min teller én gang). Teller ikke i score.">Portal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in visibleMembers" :key="m.personId" class="row-click" @click="openDetail(m)">
              <td>
                <div>{{ m.name }}</div>
                <div v-if="m.roles.length" class="d-flex mt-1" style="gap: 4px; flex-wrap: wrap;">
                  <v-chip v-for="r in m.roles" :key="r" size="x-small" variant="outlined" class="role-chip">{{ r }}</v-chip>
                </div>
              </td>
              <td>
                <v-chip :color="statusColor(m.status)" variant="flat" size="x-small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.04em;">
                  {{ statusLabel(m.status) }}
                </v-chip>
              </td>
              <td class="d-none d-md-table-cell" style="color: #aaa; white-space: nowrap;">{{ formatJoined(m.joinedAt) }}</td>
              <td class="text-right">{{ m.slackTotal }}</td>
              <td class="text-right">{{ m.attended }}</td>
              <td class="text-right">{{ m.hosted }}</td>
              <td class="text-right font-weight-bold">{{ m.score }}</td>
              <td class="d-none d-sm-table-cell" style="color: #aaa;">{{ formatLast(m.lastSeen, m.lastEver) }}</td>
              <td class="text-right d-none d-sm-table-cell" style="white-space: nowrap;">
                {{ m.portalViews }}
                <div v-if="m.lastPortal" style="color: #888; font-size: 12px;">{{ ago(m.lastPortal) }}</div>
              </td>
            </tr>
          </tbody>
        </v-table>

        <p style="color: #666; font-size: 12px;" class="mt-3">
          Vekting: post = 3, tråd-svar = 2, reaksjon = 1, oppmøte = 5, hosting = 8. Vindu: siste {{ data.windowDays }} dager.
          Portal: innloggede sidevisninger, logget i portalen fra 25. november 2026. Teller ikke i score eller sist sett.
        </p>
        </template>
      </template>
    </template>

    <!-- Member detail slide-over -->
    <v-navigation-drawer
      v-model="detailOpen"
      location="right"
      temporary
      :width="mdAndUp ? 620 : undefined"
      color="#141414"
    >
      <div class="pa-5">
        <div class="d-flex justify-end mb-2">
          <v-btn icon variant="text" size="small" style="color: #aaa;" @click="detailOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <MemberActivityDetail v-if="selectedId" :person-id="selectedId" context="board" />
      </div>
    </v-navigation-drawer>
  </div>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'

definePageMeta({ layout: 'member' })

const { mdAndUp } = useDisplay()

const windowOptions = [30, 90, 180, 365]
const days = ref(365)
const chapterOptions = [
  { value: 'no', title: 'Norge' },
  { value: 'se', title: 'Sverige' },
] as const
const chapter = ref<'no' | 'se'>('no')
const onlyFlagged = ref(false)
const search = ref<string | null>('')
const showOptions = [
  { value: 'all', title: 'Alle' },
  { value: 'active', title: 'Aktive' },
  { value: 'retired', title: 'Pensjonert' },
] as const
const show = ref<'all' | 'active' | 'retired'>('all')
const role = ref<string | null>(null)
const loading = ref(true)
const forbidden = ref(false)
const data = ref<any>(null)

const detailOpen = ref(false)
const selectedId = ref<string | null>(null)
function openDetail(m: any) {
  selectedId.value = m.personId
  detailOpen.value = true
}

async function load() {
  loading.value = true
  try {
    data.value = await $fetch(`/api/member/board/activity?days=${days.value}&chapter=${chapter.value}`)
    forbidden.value = false
  } catch (err: any) {
    if (err?.statusCode === 403 || err?.response?.status === 403) forbidden.value = true
    data.value = null
  } finally {
    loading.value = false
  }
}

function setChapter(c: 'no' | 'se') {
  if (c === chapter.value) return
  chapter.value = c
  role.value = null
  load()
}

function setDays(d: number) {
  if (d === days.value) return
  days.value = d
  load()
}

// Case- and accent-insensitive, so "ijas" finds Ijäs and "komite" finds Komité.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

// Search matches the name or any role; the role chips pick one role exactly.
function matches(p: { name: string; roles: string[] }): boolean {
  if (role.value && !p.roles.includes(role.value)) return false
  const q = fold((search.value ?? '').trim())
  if (!q) return true
  return [p.name, ...p.roles].some((text) => fold(text).includes(q))
}

const filtering = computed(() => Boolean((search.value ?? '').trim() || role.value || onlyFlagged.value))

// Every role someone in this chapter holds, board and committee first, then the SPVs.
const roleOptions = computed(() => {
  if (!data.value) return []
  const order = ['Styret', 'Komité', 'Tidl. komité']
  const all = new Set<string>([...data.value.members, ...data.value.former].flatMap((p: any) => p.roles))
  return [...all].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b, 'nb', { numeric: true })
  })
})

const visibleFormer = computed(() => (data.value ? data.value.former.filter(matches) : []))

const visibleMembers = computed(() => {
  if (!data.value) return []
  const members = onlyFlagged.value ? data.value.members.filter((m: any) => m.status !== 'active') : data.value.members
  return members.filter(matches)
})

function statusColor(status: string): string {
  return { active: '#4caf50', low: '#ff9800', dormant: '#ef5350' }[status] || '#9e9e9e'
}
function statusLabel(status: string): string {
  return { active: 'Aktiv', low: 'Lav', dormant: 'Sovende' }[status] || status
}
function personStatusLabel(status: string): string {
  return { retired: 'Pensjonert', prospect: 'Prospekt', inactive: 'Inaktiv', rejected: 'Avslått' }[status] || status
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })
}
// The original member list was imported on 2023-06-12, so that date means
// "joined then or earlier", not the day they joined.
function formatJoined(d: string | null): string {
  if (!d) return 'ukjent'
  if (d.startsWith('2023-06-12')) return 'jun. 2023 eller før'
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short' })
}
function ago(d: string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days < 1) return 'i dag'
  if (days === 1) return 'i går'
  if (days < 60) return `${days} dager siden`
  const months = Math.round(days / 30.4)
  return months < 24 ? `${months} mnd siden` : `${Math.floor(days / 365)} år siden`
}
function formatLast(lastSeen: string | null, lastEver: string | null): string {
  const d = lastSeen || lastEver
  if (!d) return 'aldri'
  const suffix = !lastSeen && lastEver ? ' (utenfor vindu)' : ''
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' }) + suffix
}

onMounted(load)
</script>

<style scoped>
.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 8px;
}
.section-count {
  color: #888;
  font-size: 13px;
  font-weight: 400;
  margin-left: 8px;
}
.role-chip {
  color: #ccc !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
}
.activity-table {
  background: transparent !important;
  color: #fff !important;
}
.activity-table :deep(th) {
  color: #fff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
  white-space: nowrap;
}
.activity-table :deep(td) {
  color: #fff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
}
.activity-table :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.05) !important;
}
.activity-table :deep(tr.row-click) {
  cursor: pointer;
}
</style>
