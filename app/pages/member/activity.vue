<template>
  <div class="activity text-left">
    <header class="mb-6">
      <div class="d-flex align-center mb-2" style="gap: 12px;">
        <h1 class="font-weight-bold mb-0" style="font-size: 1.6rem;">Aktivitet</h1>
        <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
          Kun for styret
        </v-chip>
      </div>
      <p style="color: #aaa; font-size: 14px;">
        Medlemsaktivitet fra Slack (meldinger + reaksjoner) og Luma (oppmøte + hosting).
        Sortert med de minst aktive øverst, for å flagge inaktive.
      </p>
    </header>

    <!-- Not authorized (defensive: the nav link is board-only anyway) -->
    <div v-if="forbidden" style="color: #aaa;">
      Denne siden er kun for styret.
    </div>

    <template v-else>
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
        </div>

        <v-alert type="info" variant="tonal" density="compact" class="mb-4" style="font-size: 12.5px;">
          {{ data.coverageNote }}
        </v-alert>

        <v-table density="comfortable" class="activity-table">
          <thead>
            <tr>
              <th>Medlem</th>
              <th>Status</th>
              <th class="text-right">Poster</th>
              <th class="text-right">Oppmøte</th>
              <th class="text-right">Hosting</th>
              <th class="text-right">Score</th>
              <th class="d-none d-sm-table-cell">Sist sett</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in visibleMembers" :key="m.personId">
              <td>{{ m.name }}</td>
              <td>
                <v-chip :color="statusColor(m.status)" variant="flat" size="x-small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.04em;">
                  {{ statusLabel(m.status) }}
                </v-chip>
              </td>
              <td class="text-right">{{ m.posts }}</td>
              <td class="text-right">{{ m.attended }}</td>
              <td class="text-right">{{ m.hosted }}</td>
              <td class="text-right font-weight-bold">{{ m.score }}</td>
              <td class="d-none d-sm-table-cell" style="color: #aaa;">{{ formatLast(m.lastSeen, m.lastEver) }}</td>
            </tr>
          </tbody>
        </v-table>

        <p style="color: #666; font-size: 12px;" class="mt-3">
          Vekting: melding + reaksjon = 1, oppmøte = 3, hosting = 8. Vindu: siste {{ data.windowDays }} dager.
        </p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const windowOptions = [30, 90, 180, 365]
const days = ref(90)
const onlyFlagged = ref(false)
const loading = ref(true)
const forbidden = ref(false)
const data = ref<any>(null)

async function load() {
  loading.value = true
  try {
    data.value = await $fetch(`/api/member/board/activity?days=${days.value}`)
    forbidden.value = false
  } catch (err: any) {
    if (err?.statusCode === 403 || err?.response?.status === 403) forbidden.value = true
    data.value = null
  } finally {
    loading.value = false
  }
}

function setDays(d: number) {
  if (d === days.value) return
  days.value = d
  load()
}

const visibleMembers = computed(() => {
  if (!data.value) return []
  return onlyFlagged.value ? data.value.members.filter((m: any) => m.status !== 'active') : data.value.members
})

function statusColor(status: string): string {
  return { active: '#4caf50', low: '#ff9800', dormant: '#ef5350' }[status] || '#9e9e9e'
}
function statusLabel(status: string): string {
  return { active: 'Aktiv', low: 'Lav', dormant: 'Sovende' }[status] || status
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
</style>
