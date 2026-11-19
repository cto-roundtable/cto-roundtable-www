<template>
  <v-container fluid class="apply-page">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="7" class="content">
        <p class="eyebrow">CTO Roundtable</p>
        <h1 class="headline">Søk om medlemskap</h1>
        <p class="lead">
          CTO Roundtable er et lite, tett nettverk av folk som har eller har hatt en CTO-rolle.
          Styret vurderer hver søknad, og medlemmene stemmer over opptaket (vedtektene § 4.1).
        </p>

        <div v-if="status" class="status" :class="`status-${status}`" data-test="apply-status">
          <template v-if="status === 'open'">
            <strong>Opptaket er åpent.</strong> Søknaden din går til styret, som tar den videre til en avstemning blant medlemmene.
          </template>
          <template v-else>
            <strong>Opptaket er stengt akkurat nå.</strong> Du kan likevel søke: da står du på listen,
            og styret tar den opp når opptaket åpner igjen.
          </template>
        </div>

        <section class="mt-6">
          <div v-if="submitted" class="success" data-test="apply-success">
            <p class="success-title">Takk, søknaden er registrert.</p>
            <p class="mb-0">
              {{ submittedStatus === 'closed'
                ? 'Opptaket er stengt nå, så du står på listen til det åpner igjen. Styret tar kontakt.'
                : 'Styret ser på den og tar kontakt.' }}
            </p>
          </div>

          <form v-else class="form" @submit.prevent="submit">
            <input v-model="form.website" class="hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
            <label class="field">
              <span class="label">Navn <i>*</i></span>
              <input v-model="form.name" type="text" required data-test="apply-name">
            </label>
            <label class="field">
              <span class="label">E-post <i>*</i></span>
              <input v-model="form.email" type="email" required data-test="apply-email">
            </label>
            <label class="field">
              <span class="label">LinkedIn <i>*</i></span>
              <input v-model="form.linkedin" type="url" placeholder="https://linkedin.com/in/..." required data-test="apply-linkedin">
            </label>
            <label class="field">
              <span class="label">Selskap og rolle</span>
              <input v-model="form.company" type="text">
            </label>
            <label class="field">
              <span class="label">Hvorfor vil du bli med?</span>
              <textarea v-model="form.why" rows="4" data-test="apply-why" />
            </label>
            <p v-if="error" class="error">{{ error }}</p>
            <button type="submit" :disabled="loading" class="submit" data-test="apply-submit">
              {{ loading ? 'Sender...' : status === 'closed' ? 'Sett meg på listen' : 'Send søknad' }}
            </button>
          </form>
        </section>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
useHead({ title: 'Bli medlem: CTO Roundtable', titleTemplate: '%s' })

// Admission status (hq 050, network_groups.admission_status). Closed still takes the application.
// 404 from the API = the admissions flag is off (server/utils/admissionsFlag.ts): no page.
const { data, error: statusError } = await useFetch<{ status: 'open' | 'closed' }>('/api/apply/status')
if (statusError.value) throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
const status = computed(() => data.value?.status ?? null)

const form = reactive({ name: '', email: '', linkedin: '', company: '', why: '', website: '' })
const loading = ref(false)
const submitted = ref(false)
const submittedStatus = ref<'open' | 'closed'>('open')
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const res = await $fetch<{ ok: boolean; status?: 'open' | 'closed' }>('/api/apply', {
      method: 'POST',
      body: { ...form },
    })
    submittedStatus.value = res.status ?? status.value ?? 'open'
    submitted.value = true
  } catch (e: any) {
    error.value =
      e?.statusCode === 429
        ? 'For mange søknader herfra akkurat nå. Prøv igjen om litt.'
        : e?.data?.message || 'Noe gikk galt. Prøv igjen.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.apply-page {
  padding: 5rem 1rem 4rem;
}
.content {
  text-align: left;
  line-height: 1.7;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 13px;
  color: #888;
  margin-bottom: 0.5rem;
}
.headline {
  font-size: 2.4rem;
  font-weight: 600;
  line-height: 1.2;
  margin-bottom: 1.25rem;
}
.lead {
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 1.5rem;
}
.status {
  border-radius: 8px;
  padding: 1rem 1.25rem;
  max-width: 560px;
  background: #1a1a1a;
}
.status-open {
  border: 1px solid #2f5a2f;
}
.status-closed {
  border: 1px solid #7a5a1a;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 520px;
}
.field {
  display: flex;
  flex-direction: column;
}
.label {
  font-size: 14px;
  color: #bbb;
  margin-bottom: 0.35rem;
}
.label i {
  color: #e57373;
  font-style: normal;
}
.field input,
.field textarea {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
  color: #fff;
  font-size: 16px;
  font-family: inherit;
}
.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: #777;
}
.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.submit {
  align-self: flex-start;
  background: #fff;
  color: #111;
  border: none;
  border-radius: 6px;
  padding: 0.7rem 1.6rem;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 0.5rem;
}
.submit:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: #e57373;
  font-size: 14px;
}
.success {
  background: #1a1a1a;
  border: 1px solid #2f5a2f;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
}
.success-title {
  font-weight: 600;
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  color: #fff;
}
</style>
