<template>
  <section class="protocol-panel">
    <div class="panel-head">
      <h2 class="panel-title">Protokoll</h2>
      <button
        v-if="canIssue"
        type="button"
        class="issue-btn"
        :disabled="issuing"
        @click="issue"
      >
        {{ issuing ? 'Lager …' : current ? 'Utsted ny versjon' : 'Utsted protokoll' }}
      </button>
    </div>

    <p v-if="loading" class="muted">Henter …</p>

    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-else>
      <!-- The drift warning is the whole reason the issued text is frozen: the
           referat can move afterwards, and a signature belongs to the text it
           was given, not to whatever the file says today. -->
      <p v-if="current && !current.matchesCurrentReferat" class="warning">
        Referatet er endret etter at versjon {{ current.version }} ble utstedt. Protokollen under
        gjelder fortsatt teksten den ble laget fra. Utsted en ny versjon hvis endringen skal med.
      </p>

      <p v-if="!current && !canIssue && !hasMinutes" class="muted">
        Protokollen bygges på referatet. Den kan utstedes når referatet er skrevet.
      </p>

      <p v-else-if="!current" class="muted">Ingen protokoll er utstedt for dette møtet ennå.</p>

      <article v-for="p in protocols" :key="p.id" class="version" :class="{ superseded: p.supersededAt }">
        <header class="version-head">
          <span class="version-label">
            Versjon {{ p.version }}
            <span v-if="p.supersededAt" class="badge">erstattet</span>
            <span v-else class="badge badge-current">gjeldende</span>
          </span>
          <span class="muted small">{{ formatDateTime(p.issuedAt) }}</span>
        </header>

        <dl class="facts">
          <dt>Møteleder</dt>
          <dd>{{ p.chairName ?? 'ukjent' }}</dd>
          <dt>Utstedt av</dt>
          <dd>{{ p.issuedByName ?? 'ukjent' }}</dd>
          <dt>Innholds-hash</dt>
          <dd><code>{{ p.contentSha256.slice(0, 24) }}…</code></dd>
          <dt>Signaturer</dt>
          <dd>
            <template v-if="p.signatures.length === 0">
              <span class="muted">ingen registrert</span>
            </template>
            <template v-else>
              <span v-for="s in p.signatures" :key="s.personId" class="signature">
                {{ s.signerName }}
                <span class="muted small">
                  ({{ s.role === 'chair' ? 'møteleder' : 'styremedlem' }}, {{ methodLabel(s.method) }},
                  {{ formatDate(s.signedAt) }})
                </span>
                <span v-if="!s.attestsCurrentVersion" class="warning-inline">
                  signert på en annen tekst
                </span>
              </span>
            </template>
          </dd>
        </dl>

        <p v-if="p.signatures.length < 2 && !p.supersededAt" class="muted small">
          Vedtak 4 krever to signaturer: møteleder pluss én.
          {{ p.signatures.length === 1 ? 'Én gjenstår.' : '' }}
        </p>

        <div class="actions">
          <a class="link-btn" :href="`/api/member/board/protocols/${p.id}/pdf`" target="_blank" rel="noopener">
            Last ned PDF
          </a>
          <a
            v-if="p.hasSignedFile"
            class="link-btn"
            :href="`/api/member/board/protocols/${p.id}/pdf?signed=1`"
            target="_blank"
            rel="noopener"
          >
            Signert PDF
          </a>
          <button type="button" class="link-btn" :disabled="verifying === p.id" @click="verify(p.id)">
            {{ verifying === p.id ? 'Verifiserer …' : 'Verifiser arkivet' }}
          </button>
          <span v-if="verdicts[p.id]" class="small" :class="verdicts[p.id]!.ok ? 'ok' : 'error'">
            {{ verdicts[p.id]!.ok ? 'Filene er uendret.' : 'Avvik: filen i arkivet er ikke den som ble utstedt.' }}
          </span>
        </div>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
interface Signature {
  personId: string
  role: 'chair' | 'member'
  method: 'bankid' | 'portal' | 'manual'
  signedAt: string
  signerName: string
  attestsCurrentVersion: boolean
}

interface Protocol {
  id: string
  version: number
  contentSha256: string
  chairName: string | null
  issuedByName: string | null
  issuedAt: string
  supersededAt: string | null
  hasSignedFile: boolean
  completedAt: string | null
  matchesCurrentReferat: boolean
  signatures: Signature[]
}

const props = defineProps<{ slug: string; hasMinutes: boolean }>()

const loading = ref(true)
const issuing = ref(false)
const verifying = ref<string | null>(null)
const error = ref('')
const protocols = ref<Protocol[]>([])
const verdicts = ref<Record<string, { ok: boolean }>>({})

const current = computed(() => protocols.value.find((p) => !p.supersededAt) ?? null)

// A new version is worth offering only when there is something new to capture:
// no protocol yet, or a referat that has moved since the last one.
const canIssue = computed(() => props.hasMinutes && !current.value?.matchesCurrentReferat)

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  })
}

function methodLabel(method: Signature['method']): string {
  if (method === 'bankid') return 'BankID'
  if (method === 'portal') return 'portal'
  return 'registrert manuelt'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ protocols: Protocol[] }>(`/api/member/board/meetings/${props.slug}/protocols`)
    protocols.value = data.protocols
  } catch {
    error.value = 'Klarte ikke å hente protokollene.'
  } finally {
    loading.value = false
  }
}

async function issue() {
  issuing.value = true
  error.value = ''
  try {
    await $fetch(`/api/member/board/meetings/${props.slug}/protocol`, { method: 'POST' })
    await load()
  } catch (e: any) {
    // A 422 carries the reason the referat cannot be turned into a protocol —
    // a missing section, or a character the PDF font cannot set. That reason is
    // actionable by whoever writes the referat, so it is shown verbatim rather
    // than flattened into "noe gikk galt".
    error.value = e?.data?.message || e?.statusMessage || 'Klarte ikke å utstede protokollen.'
  } finally {
    issuing.value = false
  }
}

async function verify(id: string) {
  verifying.value = id
  try {
    const result = await $fetch<{ ok: boolean }>(`/api/member/board/protocols/${id}/verify`)
    verdicts.value = { ...verdicts.value, [id]: { ok: result.ok } }
  } catch {
    verdicts.value = { ...verdicts.value, [id]: { ok: false } }
  } finally {
    verifying.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.protocol-panel {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin-top: 32px;
  padding-top: 20px;
}

.panel-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.issue-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  padding: 6px 12px;
}

.issue-btn:hover:not(:disabled) {
  border-color: #fff;
}

.issue-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.version {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  margin-bottom: 12px;
  padding: 14px 16px;
}

.version.superseded {
  opacity: 0.55;
}

.version-head {
  align-items: baseline;
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.version-label {
  font-size: 14px;
  font-weight: 600;
}

.badge {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  color: #bbb;
  font-size: 11px;
  font-weight: 500;
  margin-left: 6px;
  padding: 2px 6px;
}

.badge-current {
  background: rgba(120, 220, 150, 0.15);
  color: #8fdca8;
}

.facts {
  display: grid;
  gap: 4px 14px;
  grid-template-columns: max-content 1fr;
  margin: 0 0 8px;
}

.facts dt {
  color: #888;
  font-size: 12px;
}

.facts dd {
  font-size: 13px;
  margin: 0;
}

.facts code {
  font-size: 12px;
}

.signature {
  display: block;
}

.actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
}

.link-btn {
  background: none;
  border: none;
  color: #8ab4f8;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: none;
}

.link-btn:hover:not(:disabled) {
  text-decoration: underline;
}

.link-btn:disabled {
  color: #888;
  cursor: default;
}

.muted {
  color: #888;
}

.small {
  font-size: 12px;
}

.ok {
  color: #8fdca8;
}

.error {
  color: #f2846b;
}

.warning {
  background: rgba(240, 180, 80, 0.1);
  border-left: 2px solid rgba(240, 180, 80, 0.6);
  color: #e8c07d;
  font-size: 13px;
  margin-bottom: 14px;
  padding: 8px 12px;
}

.warning-inline {
  color: #e8c07d;
  font-size: 12px;
  margin-left: 6px;
}
</style>
