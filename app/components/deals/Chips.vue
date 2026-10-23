<template>
  <div class="d-flex align-center flex-wrap" style="gap: 6px;">
    <v-chip
      v-if="round"
      :color="roundColor"
      variant="flat"
      size="x-small"
      class="text-uppercase font-weight-bold chip"
    >
      {{ roundLabel }}
    </v-chip>
    <v-chip v-if="round" color="#2196f3" variant="flat" size="x-small" class="text-uppercase font-weight-bold chip">
      {{ round.group.name }}
    </v-chip>
    <v-chip v-if="showStatus" variant="outlined" size="x-small" class="chip status-chip">
      {{ statusLabel }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// The status line of a case: its round (open with deadline, or the result) and the
// SPV voting, then the deal's pipeline stage. Shared by the list and the case page.
interface Round {
  group: { slug: string; name: string }
  status: string
  closesAt: string | null
  result: string | null
}

const props = defineProps<{ status: string; round: Round | null }>()
const { t, te } = useI18n()
const { format } = useLocaleDate()

const statusLabel = computed(() =>
  te(`deals.status.${props.status}`) ? t(`deals.status.${props.status}`) : props.status,
)
// The stage adds nothing next to an open vote ("til avstemning") or a result.
const showStatus = computed(() => !props.round || props.round.status === 'draft')

const roundLabel = computed(() => {
  const r = props.round
  if (!r) return ''
  if (r.status === 'open' && r.closesAt) {
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
  if (r.status === 'closed' && r.result) return t(`deals.round.result.${r.result}`)
  return t(`deals.round.status.${r.status}`)
})

const roundColor = computed(() => {
  const r = props.round
  if (!r) return undefined
  if (r.status === 'open') return '#ff9800'
  if (r.status === 'closed') return r.result === 'passed' ? '#4caf50' : '#9e9e9e'
  return '#616161'
})
</script>

<style scoped>
.chip {
  letter-spacing: 0.05em;
}
.status-chip {
  color: #bbb !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}
</style>
