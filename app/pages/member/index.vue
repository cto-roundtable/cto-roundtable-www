<template>
  <div v-if="memberInfo" class="member-overview text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Oversikt</h1>
      <p style="color: #aaa; font-size: 14px;">
        Medlem siden {{ formatDate(memberInfo.memberSince) }}
      </p>
    </header>

    <section class="mb-8">
      <div class="d-flex align-center mb-4" style="gap: 12px;">
        <h2 class="section-title mb-0">Status</h2>
        <v-chip
          :color="statusColor(memberInfo.status)"
          variant="flat"
          size="small"
          class="text-uppercase font-weight-bold"
          style="letter-spacing: 0.05em;"
        >
          {{ statusLabel(memberInfo.status) }}
        </v-chip>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="section-title">Dine medlemskap</h2>
      <v-table density="comfortable" class="membership-table">
        <thead>
          <tr>
            <th>Gruppe</th>
            <th>Rolle</th>
            <th class="d-none d-sm-table-cell">Medlem siden</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in memberInfo.memberships" :key="m.slug">
            <td>{{ m.group }}</td>
            <td>{{ m.role || 'member' }}</td>
            <td class="d-none d-sm-table-cell">{{ formatDate(m.joinedAt) }}</td>
          </tr>
        </tbody>
      </v-table>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { session, checked } = useAuthSession()
const memberInfo = ref<any>(null)

watchEffect(async () => {
  if (checked.value && session.value.authenticated && !memberInfo.value) {
    memberInfo.value = await $fetch('/api/member/info')
  }
})

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    active: '#4caf50',
    retired: '#ff9800',
    inactive: '#9e9e9e',
  }
  return colors[status] || '#9e9e9e'
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Aktiv',
    retired: 'Pensjonert',
    inactive: 'Inaktiv',
  }
  return labels[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
.member-overview {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.membership-table {
  background: transparent !important;
  color: #fff !important;
}

.membership-table :deep(th) {
  color: #fff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
}

.membership-table :deep(td) {
  color: #fff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
}

.membership-table :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.05) !important;
}
</style>
