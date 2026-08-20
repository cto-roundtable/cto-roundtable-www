<template>
  <section class="protocol-panel">
    <div class="panel-head">
      <h2 class="panel-title">Protokoll</h2>
    </div>

    <!-- Vedtak 4 wants two named people. They are printed on the signature
         lines, so who they are changes the document and has to be chosen before
         it is issued, not after. -->
    <div v-if="canIssue && registerReady" class="issue-form">
      <label class="field">
        <span class="field-label">Møteleder</span>
        <select v-model="chairPersonId" class="select">
          <option v-for="m in boardMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Signerer nr. 2</span>
        <select v-model="secondSignerPersonId" class="select">
          <option value="">Ikke bestemt</option>
          <option v-for="m in boardMembers" :key="m.id" :value="m.id" :disabled="m.id === chairPersonId">
            {{ m.name }}
          </option>
        </select>
      </label>
      <button type="button" class="issue-btn" :disabled="issuing" @click="issue">
        {{ issuing ? 'Lager …' : current ? 'Utsted ny versjon' : 'Utsted protokoll' }}
      </button>
    </div>

    <p v-if="loading" class="muted">Henter …</p>

    <p v-else-if="error" class="error">{{ error }}</p>

    <p v-else-if="!registerReady" class="warning">{{ registerReason }}</p>

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
          <dt>Skal signeres av</dt>
          <dd>
            {{ p.chairName ?? 'ukjent' }} (møteleder)
            <template v-if="p.secondSignerName"> og {{ p.secondSignerName }}</template>
            <span v-else class="muted"> og én til, ikke bestemt</span>
          </dd>
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

        <!-- The external-signing loop, in the order it actually happens:
             download, sign in BankID elsewhere, come back and register it. -->
        <ol v-if="!p.supersededAt && p.signatures.length < 2" class="steps">
          <li>
            <a :href="`/api/member/board/protocols/${p.id}/pdf`" target="_blank" rel="noopener">
              Last ned protokollen
            </a>
            og signer den med BankID utenfor portalen.
          </li>
          <li>
            Last opp den signerte filen her, sammen med hvem som signerte.
            <div class="upload">
              <input
                :id="`file-${p.id}`"
                type="file"
                accept="application/pdf,.pdf"
                @change="pickFile(p.id, $event)"
              >
              <label class="field inline">
                <span class="field-label">Signert dato</span>
                <input v-model="signedAt" type="date" class="select">
              </label>
              <label class="field inline">
                <span class="field-label">Metode</span>
                <select v-model="method" class="select">
                  <option value="bankid">BankID</option>
                  <option value="manual">Registrert manuelt</option>
                </select>
              </label>
              <button
                type="button"
                class="issue-btn"
                :disabled="uploading === p.id || !files[p.id]"
                @click="uploadSigned(p)"
              >
                {{ uploading === p.id ? 'Laster opp …' : 'Registrer signert protokoll' }}
              </button>
            </div>
            <p class="muted small">
              Registreres for {{ p.chairName }} (møteleder)
              <template v-if="p.secondSignerName"> og {{ p.secondSignerName }}</template>.
              Den signerte filen har andre bytes enn den vi genererte, og det er som det skal
              være: den er stemplet av signeringstjenesten. Innholds-hashen i bunnteksten er
              det som knytter dem sammen.
            </p>
            <p v-if="uploadError" class="error small">{{ uploadError }}</p>
          </li>
        </ol>

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

interface BoardMember {
  id: string
  name: string
}

interface Protocol {
  id: string
  version: number
  contentSha256: string
  chairPersonId: string
  chairName: string | null
  secondSignerId: string | null
  secondSignerName: string | null
  issuedByName: string | null
  issuedAt: string
  supersededAt: string | null
  hasSignedFile: boolean
  completedAt: string | null
  matchesCurrentReferat: boolean
  signatures: Signature[]
}

const props = defineProps<{ slug: string; hasMinutes: boolean }>()

const { session } = useAuthSession()

const loading = ref(true)
const issuing = ref(false)
const verifying = ref<string | null>(null)
const error = ref('')
const protocols = ref<Protocol[]>([])
const verdicts = ref<Record<string, { ok: boolean }>>({})
const boardMembers = ref<BoardMember[]>([])
const registerReady = ref(true)
const registerReason = ref('')
const files = ref<Record<string, File>>({})
const uploading = ref<string | null>(null)
const uploadError = ref('')
const method = ref<'bankid' | 'manual'>('bankid')
// Defaults to today, which is almost always right: you register the signature
// the day it comes back. Editable because "almost always" is not always.
const signedAt = ref(new Date().toISOString().slice(0, 10))
const chairPersonId = ref('')
const secondSignerPersonId = ref('')

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
    const [data, board] = await Promise.all([
      $fetch<{ protocols: Protocol[]; registerReady?: boolean; reason?: string }>(
        `/api/member/board/meetings/${props.slug}/protocols`,
      ),
      $fetch<{ members: BoardMember[] }>('/api/member/board/members'),
    ])
    protocols.value = data.protocols
    registerReady.value = data.registerReady !== false
    registerReason.value = data.reason ?? ''
    boardMembers.value = board.members
    // Carry the previous version's choice forward: re-issuing after a referat
    // edit almost always keeps the same two signers.
    const previous = protocols.value[0]
    chairPersonId.value = previous?.chairPersonId ?? session.value.personId ?? board.members[0]?.id ?? ''
    secondSignerPersonId.value = previous?.secondSignerId ?? ''
  } catch (e: any) {
    // Show what the server said. The generic version of this line hid a missing
    // migration behind "noe gikk galt" and cost an afternoon of guessing.
    const reason = e?.data?.message || e?.statusMessage || ''
    error.value = reason ? `Klarte ikke å hente protokollene: ${reason}` : 'Klarte ikke å hente protokollene.'
  } finally {
    loading.value = false
  }
}

async function issue() {
  issuing.value = true
  error.value = ''
  try {
    await $fetch(`/api/member/board/meetings/${props.slug}/protocol`, {
      method: 'POST',
      body: {
        chairPersonId: chairPersonId.value || undefined,
        secondSignerPersonId: secondSignerPersonId.value || undefined,
      },
    })
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

function pickFile(id: string, event: Event) {
  const picked = (event.target as HTMLInputElement).files?.[0]
  if (picked) files.value = { ...files.value, [id]: picked }
  uploadError.value = ''
}

async function uploadSigned(p: Protocol) {
  const file = files.value[p.id]
  if (!file) return
  uploading.value = p.id
  uploadError.value = ''

  // Both named signers are registered together. Vedtak 4 wants two, the server
  // refuses a pair that does not include the chair, and a BankID-signed document
  // carries both signatures in one file anyway.
  const signatures = [{ personId: p.chairPersonId, role: 'chair', signedAt: signedAt.value }]
  if (p.secondSignerId) {
    signatures.push({ personId: p.secondSignerId, role: 'member', signedAt: signedAt.value })
  }

  const body = new FormData()
  body.append('file', file)
  body.append('signatures', JSON.stringify(signatures))
  body.append('method', method.value)

  try {
    await $fetch(`/api/member/board/protocols/${p.id}/signed`, { method: 'POST', body })
    files.value = { ...files.value, [p.id]: undefined as unknown as File }
    await load()
  } catch (e: any) {
    uploadError.value = e?.data?.message || e?.statusMessage || 'Klarte ikke å registrere den signerte protokollen.'
  } finally {
    uploading.value = null
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

.issue-form {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  color: #888;
  font-size: 12px;
}

.select {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  padding: 6px 8px;
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

.steps {
  color: #ccc;
  font-size: 13px;
  margin: 12px 0 6px;
  padding-left: 18px;
}

.steps li {
  margin-bottom: 10px;
}

.steps a {
  color: #8ab4f8;
}

.upload {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 8px 0;
}

.upload input[type='file'] {
  color: #bbb;
  font-size: 12px;
  max-width: 260px;
}

.field.inline {
  gap: 3px;
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
