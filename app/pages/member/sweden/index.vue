<template>
  <div class="sweden-overview text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.sweden.title') }}</h1>
      <p style="color: #aaa; font-size: 14px;">{{ t('member.sweden.intro') }}</p>
    </header>

    <!-- The open CTORI offering, until the member has answered (CTORI4 includes Sweden) -->
    <InvestOfferingBanner />

    <!-- Open Swedish surveys the member has not answered yet -->
    <NuxtLink
      v-for="s in pendingSurveys"
      :key="s.id"
      :to="`/member/surveys/${s.id}`"
      class="survey-banner mb-6"
    >
      <v-icon color="white" size="22">mdi-clipboard-text-outline</v-icon>
      <div class="flex-grow-1">
        <p class="font-weight-bold mb-0" style="color: #fff;">
          {{ t('member.overview.surveyBanner.title', { event: s.event.theme || s.title }) }}
        </p>
        <p class="mb-0" style="color: #ccc; font-size: 14px;">
          {{ t('member.overview.surveyBanner.body') }}
        </p>
      </div>
      <span class="survey-banner-cta">{{ t('member.overview.surveyBanner.cta') }}</span>
    </NuxtLink>

    <section class="mb-8">
      <h2 class="section-title">{{ t('member.sweden.nextHeading') }}</h2>
      <div v-if="loading" class="py-4"><v-progress-circular indeterminate color="white" size="24" /></div>
      <p v-else-if="!chapter?.upcoming.length" style="color: #aaa;">{{ t('member.sweden.noUpcoming') }}</p>
      <v-card v-for="e in chapter?.upcoming ?? []" v-else :key="e.id" variant="outlined" class="pa-4 mb-3">
        <p class="font-weight-bold mb-1" style="color: #fff;">{{ e.theme || t('member.sweden.untitled') }}</p>
        <p class="mb-1" style="color: #ccc; font-size: 14px;">
          {{ formatDate(e.date) }}<template v-if="e.location"> · {{ e.location }}</template>
        </p>
        <a v-if="e.lumaUrl" :href="e.lumaUrl" target="_blank" rel="noopener" style="color: #fff; font-size: 14px;">
          {{ t('member.sweden.onLuma') }} <v-icon size="14">mdi-open-in-new</v-icon>
        </a>
      </v-card>
    </section>

    <section v-if="chapter?.past.length" class="mb-8">
      <h2 class="section-title">{{ t('member.sweden.pastHeading') }}</h2>
      <ul class="past-list">
        <li v-for="e in chapter.past" :key="e.id">
          <span style="color: #aaa;">{{ formatDate(e.date) }}</span> · {{ e.theme || t('member.sweden.untitled') }}
        </li>
      </ul>
    </section>

    <section class="mb-8">
      <h2 class="section-title">{{ t('member.sweden.channelHeading') }}</h2>
      <p>{{ t('member.sweden.channelBody') }}</p>
    </section>

    <section class="mb-8">
      <h2 class="section-title">{{ t('member.sweden.sharedHeading') }}</h2>
      <p>{{ t('member.sweden.sharedBody') }}</p>
      <div class="d-flex flex-wrap mt-2" style="gap: 8px;">
        <v-btn to="/member/discounts" variant="outlined" size="small">{{ t('nav.discounts') }}</v-btn>
        <v-btn v-if="session.isInvestor" to="/member/updates" variant="outlined" size="small">{{ t('nav.investorUpdates') }}</v-btn>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// The Swedish chapter's own area (decision sweden-portal-scope): its evenings,
// its surveys, its channel. Offers and investor updates are shared with Norway
// on purpose, so they are links here, not copies.
definePageMeta({ layout: 'member' })

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { session, checked } = useAuthSession()

interface ChapterEvent {
  id: string
  date: string
  theme: string | null
  location: string | null
  lumaUrl: string | null
  chapter: 'no' | 'se' | null
}

const chapter = ref<{ upcoming: ChapterEvent[]; past: ChapterEvent[] } | null>(null)
const loading = ref(true)
const surveys = ref<any[]>([])

// Only this chapter's evenings, even for a member in both chapters.
function swedish(events: ChapterEvent[]) {
  return events.filter((e) => e.chapter === 'se')
}

// A survey on a Swedish event has lang 'en' (server/utils/surveys.ts surveyLang).
const pendingSurveys = computed(() =>
  surveys.value.filter((s) => s.lang === 'en' && s.isOpen && s.eligible && !s.answered),
)

watchEffect(async () => {
  if (!checked.value || !session.value.authenticated || chapter.value) return
  try {
    const data = await $fetch<{ upcoming: ChapterEvent[]; past: ChapterEvent[] }>('/api/member/chapter')
    chapter.value = { upcoming: swedish(data.upcoming), past: swedish(data.past) }
  } catch {
    chapter.value = { upcoming: [], past: [] }
  } finally {
    loading.value = false
  }
  // The survey banner is a nudge, so a failure here must not break the page.
  $fetch<{ surveys: any[] }>('/api/member/surveys')
    .then((data) => {
      surveys.value = data.surveys
    })
    .catch(() => {})
})
</script>

<style scoped>
.sweden-overview {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.past-list {
  padding-left: 1.2rem;
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
</style>
