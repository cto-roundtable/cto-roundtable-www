<template>
  <div class="member-jobb text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Åpen for jobb</h1>
      <p style="color: #aaa; font-size: 14px; line-height: 1.6; max-width: 640px;">
        Vi får jevnlig spørsmål om vi kjenner noen til en CTO-rolle. Står du i en ny situasjon,
        eller bare er nysgjerrig på hva som finnes, kan du sette deg som åpen her. Standard er at
        du ikke står oppført. Listen er kun synlig for medlemmene i investeringsgruppene og
        styret, siden det er der henvendelsene kommer inn. Du kan trekke deg når som helst.
      </p>
    </header>

    <!-- The caller's own flag -->
    <section class="mb-10">
      <h2 class="section-title">Din status</h2>

      <div v-if="loadingOwn" class="text-center py-3">
        <v-progress-circular indeterminate size="24" color="white" />
      </div>

      <v-card v-else variant="outlined" class="pa-4">
        <div v-if="own" class="d-flex align-center mb-3" style="gap: 10px;">
          <v-icon color="green" size="20">mdi-check-circle</v-icon>
          <p class="font-weight-bold mb-0">Du står som åpen for nye muligheter</p>
        </div>
        <p v-else class="mb-4" style="color: #ccc; font-size: 14px; line-height: 1.6;">
          Du står ikke oppført. Alle felt er valgfrie, det holder å melde seg.
        </p>

        <form @submit.prevent="save">
          <v-text-field
            v-model="form.lookingFor"
            label="Hva ser du etter? (valgfritt)"
            placeholder="f.eks. CTO, VP Engineering, deltid/rådgiver"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-text-field
            v-model="form.availability"
            label="Når er du tilgjengelig? (valgfritt)"
            placeholder="f.eks. nå, fra januar, 3 mnd oppsigelse"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-textarea
            v-model="form.note"
            label="Noe mer de bør vite? (valgfritt)"
            placeholder="Bransje, fase, remote, hva du ikke vil"
            rows="3"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            class="mb-3"
          />
          <v-btn
            type="submit"
            :loading="saving"
            size="large"
            block
            style="background-color: white; color: #111;"
          >
            {{ own ? 'Lagre endringer' : 'Sett meg som åpen' }}
          </v-btn>
          <v-alert
            v-if="saveError"
            type="warning"
            variant="outlined"
            class="mt-3 text-left"
          >
            {{ saveError }}
          </v-alert>
        </form>

        <div v-if="own" class="mt-3">
          <p class="mb-0" style="color: #888; font-size: 13px;">
            Satt {{ formatDate(own.createdAt) }}<span v-if="own.updatedAt !== own.createdAt">,
              oppdatert {{ formatDate(own.updatedAt) }}</span>
          </p>
          <v-btn
            variant="text"
            size="small"
            color="red"
            class="mt-2 pl-0"
            :loading="withdrawing"
            @click="withdraw"
          >
            Jeg er ikke åpen lenger
          </v-btn>
        </div>
      </v-card>
    </section>

    <!-- The list: investment cohorts and board only. The API is gated on its own;
         hiding the section is just UX. -->
    <section v-if="canSeeList" class="mb-8">
      <div class="d-flex align-center mb-3" style="gap: 12px; flex-wrap: wrap;">
        <h2 class="section-title mb-0">
          Åpne for nye muligheter<span
            v-if="!loadingList && list.length"
            style="font-weight: normal; color: #999; font-size: 14px;"
          >
            · {{ list.length }}
          </span>
        </h2>
        <v-chip color="#7e57c2" variant="flat" size="small" class="text-uppercase font-weight-bold" style="letter-spacing: 0.05em;">
          Invest + styret
        </v-chip>
      </div>
      <p class="mb-4" style="color: #aaa; font-size: 13px; line-height: 1.6; max-width: 640px;">
        Dette er delt i tillit. Ta kontakt med personen selv før du sender navnet videre til
        noen utenfor nettverket.
      </p>

      <div v-if="loadingList" class="text-center py-3">
        <v-progress-circular indeterminate size="24" color="white" />
      </div>
      <div v-else-if="listError" style="color: #aaa; font-size: 15px;">
        {{ listError }}
      </div>
      <div v-else-if="list.length === 0" class="text-muted" style="font-size: 15px;">
        Ingen står som åpne akkurat nå.
      </div>
      <div v-else class="d-flex flex-column" style="gap: 12px;">
        <v-card v-for="m in list" :key="m.personId" variant="outlined" class="pa-4">
          <p class="font-weight-bold mb-1">{{ m.name }}</p>
          <p v-if="m.company" class="mb-2" style="color: #aaa; font-size: 14px;">
            {{ m.roleTitle ? `${m.roleTitle}, ` : '' }}{{ m.company }}
          </p>
          <div style="font-size: 14px; color: #ccc; line-height: 1.7;">
            <p v-if="m.lookingFor" class="mb-1"><strong>Ser etter:</strong> {{ m.lookingFor }}</p>
            <p v-if="m.availability" class="mb-1"><strong>Tilgjengelig:</strong> {{ m.availability }}</p>
            <p v-if="m.note" class="mb-1" style="white-space: pre-line;">{{ m.note }}</p>
          </div>
          <div class="d-flex align-center mt-2" style="gap: 16px; flex-wrap: wrap; font-size: 14px;">
            <a v-if="m.email" :href="`mailto:${m.email}`" style="color: #fff; text-decoration: underline;">{{ m.email }}</a>
            <a
              v-if="m.linkedin"
              :href="m.linkedin"
              target="_blank"
              rel="noopener"
              style="color: #fff; text-decoration: underline;"
            >LinkedIn</a>
            <span style="color: #888; font-size: 13px;">Oppdatert {{ formatDate(m.updatedAt) }}</span>
          </div>
        </v-card>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface OwnFlag {
  id: string
  lookingFor: string | null
  availability: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

interface OpenMember {
  personId: string
  name: string
  email: string | null
  linkedin: string | null
  company: string | null
  roleTitle: string | null
  lookingFor: string | null
  availability: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

const { session, checked } = useAuthSession()

const canSeeList = computed(() => Boolean(session.value.isInvestor || session.value.isBoard))

const own = ref<OwnFlag | null>(null)
const loadingOwn = ref(true)
const form = ref({ lookingFor: '', availability: '', note: '' })
const saving = ref(false)
const saveError = ref('')
const withdrawing = ref(false)

const list = ref<OpenMember[]>([])
const loadingList = ref(true)
const listError = ref('')

function fillForm(flag: OwnFlag | null) {
  form.value = {
    lookingFor: flag?.lookingFor ?? '',
    availability: flag?.availability ?? '',
    note: flag?.note ?? '',
  }
}

async function loadOwn() {
  try {
    own.value = await $fetch<OwnFlag | null>('/api/member/open-to-work')
    fillForm(own.value)
  } finally {
    loadingOwn.value = false
  }
}

async function loadList() {
  loadingList.value = true
  listError.value = ''
  try {
    const data = await $fetch<{ members: OpenMember[] }>('/api/member/open-to-work/list')
    list.value = data.members
  } catch (err: any) {
    listError.value =
      err?.statusCode === 403
        ? 'Listen er kun for investeringsgruppene og styret.'
        : 'Kunne ikke hente listen. Prøv igjen.'
  } finally {
    loadingList.value = false
  }
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch('/api/member/open-to-work', { method: 'POST', body: form.value })
    await loadOwn()
    if (canSeeList.value) await loadList()
  } catch (err: any) {
    saveError.value = err?.statusMessage || err?.data?.message || 'Kunne ikke lagre. Prøv igjen.'
  } finally {
    saving.value = false
  }
}

async function withdraw() {
  withdrawing.value = true
  try {
    await $fetch('/api/member/open-to-work', { method: 'DELETE' })
    own.value = null
    fillForm(null)
    if (canSeeList.value) await loadList()
  } finally {
    withdrawing.value = false
  }
}

watchEffect(() => {
  if (checked.value && session.value.authenticated) {
    loadOwn()
    if (canSeeList.value) loadList()
  }
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
.member-jobb {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: #fff;
}

.text-muted {
  opacity: 0.7;
}
</style>
