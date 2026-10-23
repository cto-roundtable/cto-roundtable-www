<template>
  <section class="panel">
    <h2 class="panel-title mb-1">{{ t('deals.conflict.title') }}</h2>
    <p class="meta mb-3">{{ t('deals.conflict.intro') }}</p>

    <template v-if="conflict">
      <p class="state mb-1">
        <v-icon size="16" class="mr-1">mdi-hand-back-left-outline</v-icon>
        {{ t('deals.conflict.declared', { date: formatDate(conflict.declaredAt, 'short') }) }}
      </p>
      <p v-if="conflict.reason" class="reason mb-2">{{ conflict.reason }}</p>
      <p v-if="openRound" class="meta mb-2">{{ t('deals.conflict.lockedWhileOpen') }}</p>
      <v-btn v-else size="small" variant="text" class="px-0" :loading="busy" @click="withdraw">
        {{ t('deals.conflict.withdraw') }}
      </v-btn>
    </template>

    <form v-else @submit.prevent="declare">
      <v-text-field
        v-model="reason"
        :label="t('deals.conflict.reasonLabel')"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        theme="dark"
        maxlength="500"
      />
      <v-btn type="submit" class="mt-3" :loading="busy" style="background-color: white; color: #111;">
        {{ t('deals.conflict.declare') }}
      </v-btn>
      <p v-if="openRound" class="meta mt-2">{{ t('deals.conflict.openRoundNote') }}</p>
    </form>
    <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3">{{ error }}</v-alert>

    <template v-if="conflicts && conflicts.length">
      <p class="list-label mt-4 mb-2">{{ t('deals.conflict.staffLabel', conflicts.length) }}</p>
      <p v-for="c in conflicts" :key="c.person.id" class="staff-row">
        {{ c.person.name }}<span class="meta"> · {{ formatDate(c.declaredAt, 'short') }}</span>
        <span v-if="c.reason" class="meta"> · {{ c.reason }}</span>
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// "Jeg er inhabil" (mandate §9, dc-33 H3): the member's own conflict on the company.
// It freezes into the roster when a vote opens, and then only blank is possible
// (server/utils/dealConflicts.ts). The committee and board see who declared.
interface Conflict {
  declaredAt: string
  reason: string | null
}
const props = defineProps<{
  slug: string
  conflict: Conflict | null
  conflicts: { person: { id: string; name: string }; declaredAt: string; reason: string | null }[] | null
  openRound: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { $posthog } = useNuxtApp()
const reason = ref('')
const busy = ref(false)
const error = ref('')

async function call(path: string, body?: Record<string, unknown>) {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/${path}`, { method: 'POST', body })
    emit('changed')
    return true
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || t('deals.qa.error')
    return false
  } finally {
    busy.value = false
  }
}

async function declare() {
  if (await call('conflict', { reason: reason.value || null })) {
    reason.value = ''
    $posthog?.capture?.('deal_conflict_declared', { slug: props.slug })
  }
}

async function withdraw() {
  if (await call('conflict/withdraw')) $posthog?.capture?.('deal_conflict_withdrawn', { slug: props.slug })
}
</script>

<style scoped>
.panel {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 20px;
}
.panel-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #fff;
}
.meta {
  color: #888;
  font-size: 13px;
}
.state {
  color: #fff;
  font-size: 14px;
  display: flex;
  align-items: center;
}
.reason {
  color: #ccc;
  font-size: 14px;
}
.list-label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.staff-row {
  color: #ddd;
  font-size: 14px;
  margin: 0 0 4px;
}
</style>
