<template>
  <div class="case text-left">
    <NuxtLink to="/member/caser" class="back-link mb-4 d-inline-flex align-center">
      <v-icon size="16" class="mr-1">mdi-arrow-left</v-icon> {{ t('deals.case.allCases') }}
    </NuxtLink>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <template v-else-if="data">
      <header class="mb-5">
        <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ data.deal.name }}</h1>
        <DealsChips :status="data.deal.status" :round="latestRound" />
        <p v-if="data.deal.blurb" class="blurb mt-3">{{ data.deal.blurb }}</p>
        <p class="meta mt-2">
          <span v-if="data.deal.owner">{{ t('deals.case.owner', { name: data.deal.owner.name }) }}</span>
          <span v-if="data.deal.owner && data.deal.lastActivityAt"> · </span>
          <span v-if="data.deal.lastActivityAt">
            {{ t('deals.list.lastActivity', { date: formatDate(data.deal.lastActivityAt, 'short') }) }}
          </span>
        </p>
      </header>

      <section v-if="data.rounds.length" class="panel mb-4">
        <h2 class="panel-title mb-3">{{ t('deals.case.rounds') }}</h2>
        <p v-for="r in data.rounds" :key="r.id" class="round-row">{{ roundLine(r) }}</p>
      </section>

      <section class="panel mb-4">
        <h2 class="panel-title mb-1">{{ t('deals.case.material') }}</h2>
        <p class="meta mb-3">{{ t('deals.case.materialIntro') }}</p>
        <p v-if="!rawDocs.length && !memo" style="color: #aaa; font-size: 14px;">{{ t('deals.case.noDocuments') }}</p>
        <a
          v-for="d in rawDocs"
          :key="d.id"
          :href="docHref(d)"
          target="_blank"
          rel="noopener"
          class="doc-row"
          @click="trackOpen(d)"
        >
          <v-icon size="18" class="mr-3 doc-icon">{{ docIcon(d) }}</v-icon>
          <span class="doc-text">
            <span class="doc-title">{{ d.title }}</span>
            <span class="doc-meta">{{ docMeta(d) }}</span>
          </span>
          <v-icon size="16" class="doc-open">mdi-open-in-new</v-icon>
        </a>
        <template v-if="memo">
          <p class="memo-label mt-4 mb-2">{{ t('deals.case.memoLabel') }}</p>
          <a :href="docHref(memo)" target="_blank" rel="noopener" class="doc-row" @click="trackOpen(memo)">
            <v-icon size="18" class="mr-3 doc-icon">{{ docIcon(memo) }}</v-icon>
            <span class="doc-text">
              <span class="doc-title">{{ memo.title }}</span>
              <span class="doc-meta">{{ docMeta(memo) }}</span>
            </span>
            <v-icon size="16" class="doc-open">mdi-open-in-new</v-icon>
          </a>
        </template>
      </section>

      <p v-if="data.viewer.isStaff" class="staff-note">
        <v-icon size="14" class="mr-1">mdi-account-tie-outline</v-icon>{{ t('deals.case.staffNote') }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { t, n } = useI18n()
const { formatDate, format } = useLocaleDate()

interface CaseDocument {
  id: string
  key: string
  title: string
  version: number
  sha256: string
  contentType: string
  bytes: number
  uploadedAt: string
}
interface CaseRound {
  id: string
  group: { slug: string; name: string }
  status: string
  openedAt: string | null
  closesAt: string | null
  closedAt: string | null
  result: string | null
}
interface CaseResponse {
  viewer: { isCommittee: boolean; isStaff: boolean }
  deal: {
    slug: string
    name: string
    status: string
    blurb: string | null
    owner: { id: string; name: string } | null
    lastActivityAt: string | null
  }
  documents: CaseDocument[]
  rounds: CaseRound[]
}

const route = useRoute()
const slug = route.params.slug as string
const { session, checked } = useAuthSession()
const loading = ref(true)
const data = ref<CaseResponse | null>(null)
const { $posthog } = useNuxtApp()

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      data.value = await $fetch<CaseResponse>(`/api/member/deals/${slug}`)
      $posthog?.capture?.('deal_case_viewed', { slug, documents: data.value.documents.length })
    } catch {
      // 404 (no such case, or not one this member may see): back to the list.
      await navigateTo('/member/caser')
      return
    } finally {
      loading.value = false
    }
  }
})

// The open round if there is one, else the newest.
const latestRound = computed(() => {
  const rounds = data.value?.rounds ?? []
  return rounds.find((r) => r.status === 'open') ?? rounds[0] ?? null
})
// Raw material first; the memo sits apart, after it (the server already orders them).
const rawDocs = computed(() => (data.value?.documents ?? []).filter((d) => d.key !== 'memo'))
const memo = computed(() => (data.value?.documents ?? []).find((d) => d.key === 'memo') ?? null)

function docHref(d: CaseDocument) {
  return `/api/member/deals/${slug}/documents/${d.id}`
}

function docIcon(d: CaseDocument) {
  if (d.contentType === 'application/pdf') return 'mdi-file-pdf-box'
  if (d.contentType.startsWith('image/')) return 'mdi-file-image-outline'
  return 'mdi-file-document-outline'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${n(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
}

function docMeta(d: CaseDocument) {
  return t('deals.case.docMeta', {
    version: d.version,
    date: formatDate(d.uploadedAt, 'short'),
    size: formatSize(d.bytes),
  })
}

const stamp = (v: string) =>
  format(v, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function roundLine(r: CaseRound) {
  if (r.status === 'open' && r.openedAt && r.closesAt) {
    return t('deals.case.roundOpen', { group: r.group.name, opened: stamp(r.openedAt), closes: stamp(r.closesAt) })
  }
  if (r.status === 'closed' && r.closedAt) {
    const result = r.result ? t(`deals.round.result.${r.result}`) : t('deals.round.status.closed')
    return t('deals.case.roundClosed', { group: r.group.name, result, closed: stamp(r.closedAt) })
  }
  return t('deals.case.roundOther', { group: r.group.name, status: t(`deals.round.status.${r.status}`) })
}

function trackOpen(d: CaseDocument) {
  $posthog?.capture?.('deal_document_opened', { slug, key: d.key, version: d.version })
}
</script>

<style scoped>
.back-link {
  color: #aaa;
  text-decoration: none;
  font-size: 13px;
}
.back-link:hover {
  color: #fff;
}
.blurb {
  color: #ddd;
  font-size: 15px;
  line-height: 1.55;
  max-width: 680px;
}
.meta {
  color: #888;
  font-size: 13px;
}
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
.round-row {
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}
.round-row + .round-row {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 10px;
  padding-top: 10px;
}
.doc-row {
  display: flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 8px;
  color: #fff;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.03);
  min-height: 48px;
}
.doc-row:hover,
.doc-row:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.doc-icon,
.doc-open {
  color: #aaa;
  flex: none;
}
.doc-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.doc-title {
  font-size: 14px;
  font-weight: 500;
}
.doc-meta {
  color: #888;
  font-size: 12px;
}
.memo-label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.staff-note {
  color: #ffb74d;
  font-size: 13px;
}
</style>
