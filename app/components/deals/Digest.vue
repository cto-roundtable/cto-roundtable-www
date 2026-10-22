<template>
  <div class="digest">
    <p class="meta mb-2">{{ t('deals.digest.madeBy', { who: madeBy, date: formatDate(digest.createdAt, 'short'), n: digest.commentIds.length }) }}</p>
    <!-- Rendered from a strict, escape-first markdown subset (no raw HTML). -->
    <div class="d-body" v-html="renderMarkdown(digest.bodyMd)" />
    <div v-if="digest.themes.length" class="d-flex flex-wrap mt-3" style="gap: 6px;">
      <span v-for="th in digest.themes" :key="th.theme" class="theme">
        {{ th.of ? t('deals.digest.themeOf', { theme: th.theme, count: th.count, of: th.of }) : t('deals.digest.theme', { theme: th.theme, count: th.count }) }}
      </span>
    </div>
    <template v-if="digest.newInformation.length">
      <p class="sub mt-4 mb-1">{{ t('deals.digest.newInformation') }}</p>
      <ul class="items">
        <li v-for="(x, i) in digest.newInformation" :key="i">{{ x.text }}</li>
      </ul>
    </template>
    <template v-if="digest.founderQuestions.length">
      <p class="sub mt-4 mb-1">{{ t('deals.digest.founderQuestions') }}</p>
      <ul class="items">
        <li v-for="(x, i) in digest.founderQuestions" :key="i">{{ x.text }}</li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
// One digest of the comments on a case (server/utils/dealDigests.ts): the agent's
// summary, themes with counts, new information and questions for the founder.
interface Digest {
  id: string
  audience: string
  bodyMd: string
  themes: { theme: string; count: number; of?: number }[]
  founderQuestions: { text: string }[]
  newInformation: { text: string }[]
  commentIds: string[]
  madeBy: string
  createdAt: string
}

const props = defineProps<{ digest: Digest }>()
const { t } = useI18n()
const { formatDate } = useLocaleDate()

// "agent:<acp link>" reads as "agenten"; a person's name stays a name.
const madeBy = computed(() =>
  props.digest.madeBy.startsWith('agent:') ? t('deals.digest.agent') : props.digest.madeBy,
)
</script>

<style scoped>
.meta {
  color: #888;
  font-size: 12.5px;
}
.d-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
}
.d-body :deep(p) {
  margin: 0 0 10px;
}
.d-body :deep(ul) {
  margin: 0 0 10px;
  padding-left: 20px;
}
.theme {
  font-size: 12.5px;
  color: #ddd;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 3px 8px;
}
.sub {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.items {
  color: #ddd;
  font-size: 14px;
  line-height: 1.5;
  padding-left: 20px;
}
.items li {
  margin-bottom: 4px;
}
</style>
