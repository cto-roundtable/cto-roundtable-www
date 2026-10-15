<template>
  <div v-if="memberInfo" class="member-overview text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Oversikt</h1>
      <p style="color: #aaa; font-size: 14px;">
        Medlem siden {{ formatDate(memberInfo.memberSince) }}
      </p>
    </header>

    <!-- Open surveys the member has not answered yet (/member/surveys) -->
    <NuxtLink
      v-for="s in pendingSurveys"
      :key="s.id"
      :to="`/member/surveys/${s.id}`"
      class="survey-banner mb-6"
    >
      <v-icon color="white" size="22">mdi-clipboard-text-outline</v-icon>
      <div class="flex-grow-1">
        <p class="font-weight-bold mb-0" style="color: #fff;">
          {{ s.lang === 'en' ? 'How was' : 'Hvordan var' }} {{ s.event.theme || s.title }}?
        </p>
        <p class="mb-0" style="color: #ccc; font-size: 14px;">
          {{ s.lang === 'en' ? 'A short survey, a couple of minutes.' : 'En kort undersøkelse, et par minutter.' }}
        </p>
      </div>
      <span class="survey-banner-cta">{{ s.lang === 'en' ? 'Answer' : 'Svar nå' }}</span>
    </NuxtLink>

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
const surveys = ref<any[]>([])

const pendingSurveys = computed(() => surveys.value.filter((s) => s.isOpen && s.eligible && !s.answered))

watchEffect(async () => {
  if (checked.value && session.value.authenticated && !memberInfo.value) {
    memberInfo.value = await $fetch('/api/member/info')
  }
})

// The survey banner is a nudge, so a failure here must not break the overview.
watchEffect(() => {
  if (checked.value && session.value.authenticated) {
    $fetch<{ surveys: any[] }>('/api/member/surveys')
      .then((data) => {
        surveys.value = data.surveys
      })
      .catch(() => {})
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

.survey-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.survey-banner:hover {
  border-color: rgba(255, 255, 255, 0.6);
}

.survey-banner-cta {
  flex-shrink: 0;
  background: #fff;
  color: #111;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
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
