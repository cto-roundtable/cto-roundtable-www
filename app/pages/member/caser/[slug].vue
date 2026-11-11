<template>
  <div class="case text-left">
    <NuxtLink to="/member/caser" class="back-link">
      <v-icon size="16" class="mr-1" aria-hidden="true">mdi-arrow-left</v-icon> {{ t('deals.case.allCases') }}
    </NuxtLink>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <template v-else-if="data">
      <header class="case-head">
        <h1 class="case-title">{{ data.deal.name }}</h1>
        <dl class="facts">
          <div class="fact">
            <dt>{{ t('deals.case.statusLabel') }}</dt>
            <dd>
              <span class="state" :class="`state-${tone}`"><span class="dot" aria-hidden="true" />{{ stateLabel }}</span>
            </dd>
          </div>
          <div class="fact">
            <dt>{{ t('deals.case.ownerLabel') }}</dt>
            <dd>{{ data.deal.owner?.name ?? t('deals.case.noOwner') }}</dd>
          </div>
          <div v-if="data.deal.coLeads.length" class="fact">
            <dt>{{ t('deals.case.coLeadLabel') }}</dt>
            <dd>{{ data.deal.coLeads.map((p) => p.name).join(', ') }}</dd>
          </div>
          <div class="fact">
            <dt>{{ t('deals.case.lastActivityLabel') }}</dt>
            <dd>{{ data.deal.lastActivityAt ? formatDate(data.deal.lastActivityAt, 'long') : t('deals.case.noActivity') }}</dd>
          </div>
        </dl>
        <p v-if="data.deal.blurb" class="blurb">{{ data.deal.blurb }}</p>
        <!-- Invested: the company's own investor updates, for those whose SPV invested. -->
        <NuxtLink v-if="data.deal.followUp && data.deal.ours" :to="`/member/updates/${slug}`" class="updates-link">
          <v-icon size="18" class="mr-2" aria-hidden="true">mdi-finance</v-icon>
          {{ t('deals.case.followUp.updates', { name: data.deal.name }) }}
          <v-icon size="16" class="ml-1" aria-hidden="true">mdi-chevron-right</v-icon>
        </NuxtLink>
      </header>

      <!-- A new lead ('incoming'): only the committee gets here at all. How it came in, and the moves out. -->
      <section v-if="data.lead" class="lead-panel" :aria-label="t('deals.lead.pageTitle')">
        <h2 class="sub-title">
          {{ t('deals.lead.pageTitle') }}
          <span class="only-committee"><v-icon size="13" aria-hidden="true">mdi-lock-outline</v-icon>{{ t('deals.case.onlyCommittee') }}</span>
        </h2>
        <p class="section-intro">{{ t('deals.lead.pageIntro') }}</p>
        <DealsLead :lead="data.lead" on-page @moved="onLeadMoved" />
      </section>

      <!-- Where to go on this page: every action a member has lives in its own section below. -->
      <nav class="jump" :aria-label="t('deals.case.jumpAria')">
        <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="jump-link" @click.prevent="jump(s.id)">
          {{ s.label }}<span v-if="s.count" class="jump-count">{{ s.count }}</span>
        </a>
      </nav>

      <div class="sections">
        <!-- A follow-up page (invested) has no vote, no "Jeg er inhabil" and no review chips. -->
        <section v-if="data.rounds.length && !data.deal.followUp" id="vote" class="panel">
          <h2 class="panel-title mb-3">{{ t('deals.case.rounds') }}</h2>
          <DealsBallot v-for="r in data.rounds" :key="r.id" :slug="slug" :round="r" @changed="reload" />
        </section>

        <section id="materiale" class="panel">
          <h2 class="panel-title mb-1">{{ t('deals.case.material') }}</h2>
          <p v-if="data.deal.materialShared" class="section-intro">{{ t('deals.case.materialIntro') }}</p>
          <p v-if="!data.deal.materialShared" class="section-intro">{{ t('deals.case.materialNotShared') }}</p>
          <p v-else-if="!rawDocs.length && !memo" class="section-intro">{{ t('deals.case.noDocuments') }}</p>
          <a
            v-for="d in rawDocs"
            :key="d.id"
            :href="docHref(d)"
            target="_blank"
            rel="noopener"
            class="doc-row"
            @click="trackOpen(d)"
          >
            <v-icon size="18" class="mr-3 doc-icon" aria-hidden="true">{{ docIcon(d) }}</v-icon>
            <span class="doc-text">
              <span class="doc-title">{{ d.title }}</span>
              <span class="doc-meta">{{ docMeta(d) }}</span>
            </span>
            <v-icon size="16" class="doc-open" aria-hidden="true">mdi-open-in-new</v-icon>
          </a>
          <template v-if="memo">
            <p class="memo-label">{{ t('deals.case.memoLabel') }}</p>
            <a :href="docHref(memo)" target="_blank" rel="noopener" class="doc-row" @click="trackOpen(memo)">
              <v-icon size="18" class="mr-3 doc-icon" aria-hidden="true">{{ docIcon(memo) }}</v-icon>
              <span class="doc-text">
                <span class="doc-title">{{ memo.title }}</span>
                <span class="doc-meta">{{ docMeta(memo) }}</span>
              </span>
              <v-icon size="16" class="doc-open" aria-hidden="true">mdi-open-in-new</v-icon>
            </a>
          </template>
        </section>

        <DealsQuestions
          id="qa"
          :slug="slug"
          :questions="data.questions"
          :waiting="data.questionsWaiting"
          :can-answer="data.canAnswer"
          :follow-up="data.deal.followUp"
          @changed="reload"
        />

        <DealsComments
          id="innspill"
          :slug="slug"
          :comments="data.comments"
          :is-committee="data.viewer.isCommittee"
          :follow-up="data.deal.followUp"
          @changed="reload"
        >
          <!-- The agent's digest of the comments: "what we heard" for the SPV, the committee's own for the committee. -->
          <div v-if="data.digests.spv" class="digest-block">
            <h3 class="sub-title">{{ t('deals.digest.titleSpv') }}</h3>
            <DealsDigest :digest="data.digests.spv" />
          </div>
          <div v-if="data.digests.committee" class="digest-block">
            <h3 class="sub-title">
              {{ t('deals.digest.titleCommittee') }}
              <span class="only-committee"><v-icon size="13" aria-hidden="true">mdi-lock-outline</v-icon>{{ t('deals.case.onlyCommittee') }}</span>
            </h3>
            <DealsDigest :digest="data.digests.committee" />
          </div>
        </DealsComments>

        <DealsConflict
          v-if="!data.deal.followUp"
          id="inhabil"
          :slug="slug"
          :conflict="data.conflict"
          :conflicts="data.conflicts"
          :open-round="data.rounds.some((r) => r.status === 'open')"
          @changed="reload"
        />

        <!-- Committee only (dc-39): who earns the CTORI4 incentive. Re-reads when a vote closes. -->
        <DealsHovedbok
          v-if="data.viewer.isCommittee"
          :key="data.rounds.map((r) => r.status).join()"
          id="hovedbok"
          :slug="slug"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// One case: where it stands (status, ansvarlig from deal_people, last activity) on top,
// then calm sections for the vote, the material, Q&A, input to the committee and "Jeg er
// inhabil". The actions the old pipeline cards repeated on every row land here, in their
// section (/member/caser/<slug>#qa, ?innspill=objection#innspill, #inhabil).
definePageMeta({ layout: 'member' })

const { t, te, n } = useI18n()
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
interface CaseResponse {
  viewer: { isCommittee: boolean }
  deal: {
    slug: string
    name: string
    status: string
    blurb: string | null
    owner: { id: string; name: string } | null
    coLeads: { id: string; name: string }[]
    lastActivityAt: string | null
    materialShared: boolean
    followUp: boolean
    ours: boolean
  }
  documents: CaseDocument[]
  // The round view is typed where it is drawn (DealsBallot).
  rounds: any[]
  questions: any[]
  questionsWaiting: number
  canAnswer: boolean
  comments: any[]
  conflict: { declaredAt: string; reason: string | null } | null
  conflicts: { person: { id: string; name: string }; declaredAt: string; reason: string | null }[] | null
  digests: { committee: any | null; spv: any | null }
  // A new lead, for the committee only (typed where it is drawn, DealsLead).
  lead: any | null
}

const route = useRoute()
const slug = route.params.slug as string
const { session, checked } = useAuthSession()
const loading = ref(true)
const data = ref<CaseResponse | null>(null)
const { $posthog } = useNuxtApp()

function fetchCase() {
  return $fetch<CaseResponse>(`/api/member/deals/${slug}`)
}

watch(
  () => checked.value && session.value.authenticated,
  async (ready) => {
    if (!ready) return
    loading.value = true
    try {
      data.value = await fetchCase()
      $posthog?.capture?.('deal_case_viewed', {
        slug,
        documents: data.value.documents.length,
      })
      // A link from a mail lands on #q-<id>, a link from elsewhere on a section: scroll once rendered.
      if (route.hash) nextTick(() => document.querySelector(route.hash)?.scrollIntoView())
    } catch {
      // 404 (no such case, or not one this member may see): back to the list.
      await navigateTo('/member/caser')
      return
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

/** Re-read the case after a question, an answer or a ballot, without the loading state. */
async function reload() {
  data.value = await fetchCase()
}

/** Out of 'incoming': a lead the committee said no to is no longer a case, so back to Komiteen. */
async function onLeadMoved(m: { status: string }) {
  if (m.status === 'rejected') await navigateTo('/member/komite')
  else await reload()
}

// The counts are live: re-read every 30 seconds while a vote is open on the case.
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  poll = setInterval(() => {
    if (data.value?.rounds.some((r) => r.status === 'open') && document.visibilityState === 'visible') {
      reload().catch(() => {})
    }
  }, 30_000)
})
onBeforeUnmount(() => clearInterval(poll))

// The open round if there is one, else the newest.
const latestRound = computed(() => {
  const rounds = data.value?.rounds ?? []
  return rounds.find((r) => r.status === 'open') ?? rounds[0] ?? null
})

const stateLabel = computed(() => {
  const d = data.value
  if (!d) return ''
  const r = latestRound.value
  if (r?.status === 'open' && r.closesAt) {
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
  const s = d.deal.status
  const label = te(`deals.status.${s}`) ? t(`deals.status.${s}`) : s
  // A closed vote says who decided it: "Vedtatt, venter på overføring · Invest 3".
  return r?.status === 'closed' ? `${label} · ${r.group.name}` : label
})

const tone = computed(() => {
  const s = data.value?.deal.status
  if (latestRound.value?.status === 'open' || s === 'to_be_voted') return 'open'
  if (s === 'pending_transfer' || s === 'invested') return 'done'
  return 'neutral'
})

const sections = computed(() => {
  const d = data.value
  if (!d) return []
  if (d.deal.followUp) {
    return [
      { id: 'materiale', label: t('deals.case.material'), count: d.documents.length },
      { id: 'qa', label: t('deals.case.followUp.qaTitle'), count: d.questions.length },
      { id: 'innspill', label: t('deals.case.followUp.inputTitle'), count: 0 },
    ]
  }
  return [
    ...(d.rounds.length ? [{ id: 'vote', label: t('deals.case.rounds'), count: 0 }] : []),
    { id: 'materiale', label: t('deals.case.material'), count: d.documents.length },
    { id: 'qa', label: t('deals.qa.title'), count: d.questions.length },
    { id: 'innspill', label: t('deals.case.jumpInput'), count: 0 },
    { id: 'inhabil', label: t('deals.case.jumpConflict'), count: 0 },
  ]
})

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}

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

function trackOpen(d: CaseDocument) {
  $posthog?.capture?.('deal_document_opened', { slug, key: d.key, version: d.version })
}
</script>

<style scoped>
.updates-link {
  display: inline-flex;
  align-items: center;
  margin-top: 16px;
  padding: 10px 14px;
  min-height: 44px;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 15px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
}
.updates-link:hover,
.updates-link:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.back-link {
  display: inline-flex;
  align-items: center;
  color: #aaa;
  text-decoration: none;
  font-size: 14px;
  min-height: 32px;
  margin-bottom: 12px;
}
.back-link:hover,
.back-link:focus-visible {
  color: #fff;
}
.case-head {
  margin-bottom: 20px;
}
.case-title {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 18px;
}
.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, auto));
  justify-content: start;
  gap: 8px 40px;
  margin: 0;
}
.fact dt {
  color: #999;
  font-size: 12.5px;
  margin-bottom: 2px;
}
.fact dd {
  color: #fff;
  font-size: 15px;
  margin: 0;
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #777;
  flex: none;
}
.state-open {
  color: #ffb74d;
}
.state-open .dot {
  background: #ff9800;
}
.state-done .dot {
  background: #4caf50;
}
.blurb {
  color: #ddd;
  font-size: 15.5px;
  line-height: 1.6;
  max-width: 66ch;
  margin: 20px 0 0;
}
.lead-panel {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: #161616;
  padding: 18px 20px;
  margin: 8px 0 20px;
  max-width: 760px;
}
.jump {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 24px 0 8px;
}
.jump-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: #ddd;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 6px 14px;
  min-height: 36px;
}
.jump-link:hover,
.jump-link:focus-visible {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}
.jump-count {
  color: #999;
  font-size: 12.5px;
}
.sections > * {
  scroll-margin-top: 72px;
}
.sections[inert] {
  opacity: 0.85;
}
.panel {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 32px 0 28px;
}
.panel-title {
  font-size: 1.2rem;
  font-weight: 650;
  color: #fff;
}
.section-intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.55;
  max-width: 66ch;
  margin: 0 0 14px;
}
.doc-row {
  display: flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  color: #fff;
  text-decoration: none;
  background: #161616;
  min-height: 52px;
  max-width: 680px;
}
.doc-row:hover,
.doc-row:focus-visible {
  background: rgba(255, 255, 255, 0.07);
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
  font-size: 14.5px;
  font-weight: 500;
}
.doc-meta {
  color: #999;
  font-size: 12.5px;
}
.memo-label {
  color: #999;
  font-size: 13px;
  margin: 18px 0 8px;
}
.digest-block {
  margin-top: 28px;
}
.sub-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px;
}
.only-committee {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #aaa;
  font-size: 12.5px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 1px 9px;
}

@media (max-width: 600px) {
  .case-title {
    font-size: 1.6rem;
  }
  .facts {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .fact {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .fact dd {
    text-align: right;
  }
}
</style>
