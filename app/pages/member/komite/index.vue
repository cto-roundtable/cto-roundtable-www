<template>
  <div class="committee text-left">
    <NuxtLink to="/member/caser" class="back-link mb-4 d-inline-flex align-center">
      <v-icon size="16" class="mr-1">mdi-arrow-left</v-icon> {{ t('deals.case.allCases') }}
    </NuxtLink>
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('deals.committee.title') }}</h1>
      <p style="color: #aaa; font-size: 14px; max-width: 640px;">{{ t('deals.committee.intro') }}</p>
    </header>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>
    <p v-else-if="forbidden" style="color: #aaa;">{{ t('deals.committee.forbidden') }}</p>

    <section v-if="!loading && drafts.length" class="mb-6">
      <h2 class="section-title mb-3">{{ t('deals.pipelineDigest.toApprove') }}</h2>
      <DealsPipelineDigestReview v-for="d in drafts" :key="d.id" :digest="d" class="mb-3" @changed="reload" />
    </section>
    <p v-else-if="!cases.length" style="color: #aaa;">{{ t('deals.list.empty') }}</p>

    <section v-else class="feed">
      <article v-for="c in cases" :key="c.slug" class="case-card">
        <div class="d-flex align-center flex-wrap mb-2" style="gap: 10px;">
          <NuxtLink :to="`/member/caser/${c.slug}`" class="company-name">{{ c.name }}</NuxtLink>
          <DealsChips :status="c.status" :round="c.round ? { ...c.round, group: { slug: '', name: c.round.group } } : null" />
        </div>
        <div class="waits mb-2">
          <NuxtLink v-if="c.questionsRouted" :to="`/member/caser/${c.slug}`" class="wait wait-hot">
            {{ t('deals.committee.routed', c.questionsRouted) }}
          </NuxtLink>
          <NuxtLink v-if="c.answersUnconfirmed" :to="`/member/caser/${c.slug}`" class="wait">
            {{ t('deals.committee.unconfirmed', c.answersUnconfirmed) }}
          </NuxtLink>
          <span v-if="c.questionsOpen" class="wait">{{ t('deals.committee.withAgent', c.questionsOpen) }}</span>
          <span class="wait">{{ t('deals.committee.comments', { all: c.comments, fresh: c.commentsSinceDigest }) }}</span>
        </div>
        <details v-if="c.digest" class="digest-box">
          <summary>{{ t('deals.committee.digest', { date: formatDate(c.digest.createdAt, 'short') }) }}</summary>
          <DealsDigest :digest="c.digest" class="mt-3" />
        </details>
        <p v-else class="meta">{{ t('deals.committee.noDigest') }}</p>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
// The committee's overview across cases: what waits for it (questions routed to
// an owner, agent answers to confirm, new comments) and the newest digest of each.
// Committee and board only (server/api/member/committee/overview.get.ts).
definePageMeta({ layout: 'member' })

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()
const loading = ref(true)
const forbidden = ref(false)
const cases = ref<any[]>([])
const drafts = ref<any[]>([])

async function reload() {
  const data = await $fetch<{ cases: any[]; pipelineDigests: { drafts: any[] } }>('/api/member/committee/overview')
  cases.value = data.cases
  drafts.value = data.pipelineDigests.drafts
}

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      await reload()
    } catch {
      forbidden.value = true
    } finally {
      loading.value = false
    }
  }
})
</script>

<style scoped>
.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
}
.back-link {
  color: #aaa;
  text-decoration: none;
  font-size: 13px;
}
.back-link:hover {
  color: #fff;
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.case-card {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 18px;
}
.company-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
}
.company-name:hover {
  text-decoration: underline;
}
.waits {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wait {
  font-size: 12.5px;
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 3px 8px;
  text-decoration: none;
}
.wait-hot {
  color: #111;
  background: #ffb74d;
  border-color: #ffb74d;
  font-weight: 600;
}
.digest-box summary {
  cursor: pointer;
  color: #ddd;
  font-size: 14px;
  min-height: 32px;
}
.meta {
  color: #888;
  font-size: 13px;
}
</style>
