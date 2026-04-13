<template>
  <v-container fluid class="text-center">
    <v-row justify="center" class="full-height">
      <v-col class="top-spacing" cols="12" md="8">
        <!-- Loading state -->
        <div v-if="loading" class="mt-8">
          <v-progress-circular indeterminate color="white" />
        </div>

        <!-- Login form -->
        <div v-else-if="!session.authenticated" class="login-section">
          <h1 class="font-weight-bold mb-4">Member Portal</h1>
          <p class="text-muted mb-6">Sign in with your membership email to access member information.</p>

          <v-alert v-if="error" type="warning" variant="outlined" class="mb-4 text-left" style="max-width: 420px; margin: 0 auto 16px auto;">
            <span v-if="error === 'expired'">This link has expired or has already been used. Please request a new one.</span>
            <span v-else-if="error === 'invalid'">Invalid sign-in link. Please request a new one.</span>
            <span v-else>Something went wrong. Please try again.</span>
          </v-alert>

          <form @submit.prevent="requestMagicLink" style="max-width: 420px; margin: 0 auto;">
            <v-text-field
              v-model="email"
              label="Email address"
              type="email"
              variant="outlined"
              density="comfortable"
              :disabled="sent"
              required
            />
            <v-btn
              v-if="!sent"
              type="submit"
              size="large"
              block
              :loading="submitting"
              style="background-color: white; color: #111;"
            >
              Send sign-in link
            </v-btn>
            <v-alert v-if="sent" type="success" variant="outlined" class="text-left">
              Check your email for a sign-in link. It expires in 15 minutes.
            </v-alert>
          </form>
        </div>

        <!-- Authenticated member content -->
        <div v-else class="member-content">
          <div class="d-flex justify-space-between align-center mb-6" style="max-width: 720px; margin: 0 auto;">
            <h1 class="font-weight-bold">Member Portal</h1>
            <v-btn variant="text" size="small" @click="logout" style="color: #999;">
              Sign out
            </v-btn>
          </div>

          <div v-if="memberInfo" class="text-left" style="max-width: 720px; margin: 0 auto;">
            <v-card variant="outlined" class="mb-6 pa-4">
              <div class="d-flex align-center justify-space-between flex-wrap">
                <div>
                  <p class="mb-1" style="font-size: 14px; color: #999;">Signed in as</p>
                  <p class="font-weight-bold" style="font-size: 20px;">{{ memberInfo.name }}</p>
                  <p style="color: #999; font-size: 14px;">Member since {{ formatDate(memberInfo.memberSince) }}</p>
                </div>
                <v-chip
                  :color="statusColor(memberInfo.status)"
                  variant="flat"
                  size="small"
                  class="text-uppercase font-weight-bold mt-2"
                  style="letter-spacing: 0.05em;"
                >
                  {{ statusLabel(memberInfo.status) }}
                </v-chip>
              </div>
            </v-card>

            <section class="mb-8">
              <h2 class="font-weight-bold mb-3">Aktivitetskrav</h2>
              <p>For å opprettholde et aktivt og verdifullt fellesskap, forventes medlemmer å:</p>
              <ul class="mt-2">
                <li><strong>Delta på minst 2 samlinger per år.</strong> Samlinger inkluderer fysiske møter, workshops og sosiale arrangementer.</li>
                <li><strong>Være aktiv i Slack-kanalen.</strong> Bidra til diskusjoner, del erfaringer og still spørsmål.</li>
                <li><strong>Gi beskjed ved fravær.</strong> Hvis du vet at du kommer til å være mindre aktiv en periode, gi styret beskjed.</li>
              </ul>
              <p class="mt-3">Styret vurderer aktivitetsnivå jevnlig. Hvis kravene ikke oppfylles over tid, kan styret ta kontakt for en samtale om veien videre.</p>
            </section>

            <section class="mb-8">
              <h2 class="font-weight-bold mb-3">Pensjonering</h2>
              <p>Et medlem som over lengre tid ikke oppfyller aktivitetskravene kan pensjoneres av styret. Pensjonering er ikke en straff, men en anerkjennelse av at livet og prioriteringene endrer seg.</p>

              <h3 class="font-weight-bold mt-4 mb-2">Hva pensjonering innebærer</h3>
              <ul>
                <li>Du beholder tilgang til Slack, men mister tilgang til private kanaler og flyttes til en pensjonert-rolle.</li>
                <li>Du kan ikke delta på roundtable-samlinger, men er velkommen på sosiale arrangementer.</li>
                <li>Du har ikke stemmerett på årsmøte.</li>
                <li>Du kan når som helst søke styret om gjenopptak av aktivt medlemskap.</li>
              </ul>

              <h3 class="font-weight-bold mt-4 mb-2">Gjenopptak</h3>
              <p>Ønsker du å bli aktivt medlem igjen? Ta kontakt med styret. Vi vurderer gjenopptak basert på din intensjon og kapasitet til å delta aktivt.</p>
            </section>

            <section class="mb-8">
              <h2 class="font-weight-bold mb-3">Dine medlemskap</h2>
              <v-table density="comfortable" class="membership-table">
                <thead>
                  <tr>
                    <th>Gruppe</th>
                    <th>Rolle</th>
                    <th>Medlem siden</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in memberInfo.memberships" :key="m.slug">
                    <td>{{ m.group }}</td>
                    <td>{{ m.role || 'member' }}</td>
                    <td>{{ formatDate(m.joinedAt) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </section>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
const route = useRoute()

const loading = ref(true)
const email = ref('')
const submitting = ref(false)
const sent = ref(false)
const error = ref(route.query.error as string || '')

const session = ref<{ authenticated: boolean; name?: string; personId?: string }>({ authenticated: false })
const memberInfo = ref<any>(null)

async function checkSession() {
  try {
    const data = await $fetch('/api/auth/session')
    session.value = data
    if (data.authenticated) {
      memberInfo.value = await $fetch('/api/member/info')
    }
  } catch {
    session.value = { authenticated: false }
  } finally {
    loading.value = false
  }
}

async function requestMagicLink() {
  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/request', {
      method: 'POST',
      body: { email: email.value },
    })
    sent.value = true
  } catch {
    error.value = 'unknown'
  } finally {
    submitting.value = false
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  session.value = { authenticated: false }
  memberInfo.value = null
}

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

onMounted(() => {
  checkSession()
})
</script>

<style scoped>
.top-spacing {
  margin-top: 3rem;
}

.member-content {
  text-align: left;
  line-height: 1.8;
}

.member-content h2 {
  margin-top: 1.5rem;
  font-size: 1.5rem;
}

.member-content h3 {
  font-size: 1.15rem;
}

.member-content p {
  margin-bottom: 0.75rem;
  font-size: 16px;
}

.member-content ul {
  margin-left: 1.5rem;
  margin-bottom: 1rem;
}

.member-content ul li {
  margin-bottom: 0.5rem;
}

.text-muted {
  opacity: 0.8;
}

.login-section h1 {
  margin-top: 4rem;
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
