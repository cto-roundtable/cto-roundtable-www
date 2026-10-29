<template>
  <section class="panel">
    <h2 class="panel-title mb-1">{{ isCommittee ? t('deals.comments.titleStaff') : t('deals.comments.title') }}</h2>
    <p class="meta mb-4">{{ isCommittee ? t('deals.comments.introStaff') : t('deals.comments.intro') }}</p>

    <form class="mb-5" @submit.prevent="send">
      <v-chip-group v-model="kind" mandatory selected-class="kind-on" class="mb-2" column>
        <v-chip v-for="k in kinds" :key="k" :value="k" variant="outlined" size="small" class="kind">
          {{ t(`deals.comments.kind.${k}`) }}
        </v-chip>
      </v-chip-group>
      <v-textarea
        v-model="draft"
        :label="t(`deals.comments.placeholder.${kind}`)"
        rows="3"
        auto-grow
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        theme="dark"
      />
      <div class="d-flex align-center flex-wrap mt-3" style="gap: 12px;">
        <v-btn
          type="submit"
          :loading="sending"
          :disabled="!draft.trim()"
          style="background-color: white; color: #111;"
        >
          {{ t('deals.comments.submit') }}
        </v-btn>
        <span v-if="sent" class="ok-note">{{ t('deals.comments.sent') }}</span>
      </div>
      <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3">{{ error }}</v-alert>
    </form>

    <template v-if="comments.length">
      <p class="list-label mb-2">{{ isCommittee ? t('deals.comments.allLabel', comments.length) : t('deals.comments.mineLabel') }}</p>
      <article v-for="c in comments" :key="c.id" class="comment" :class="{ withdrawn: c.withdrawnAt }">
        <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px;">
          <span class="kind-tag" :class="`kind-${c.kind}`">{{ t(`deals.comments.kind.${c.kind}`) }}</span>
          <span class="meta">{{ byline(c) }}</span>
        </div>
        <p class="c-body">{{ c.body }}</p>
        <p v-if="c.withdrawnAt" class="meta">{{ t('deals.comments.withdrawnOn', { date: formatDate(c.withdrawnAt, 'short') }) }}</p>
        <v-btn
          v-else-if="c.mine"
          size="small"
          variant="text"
          class="px-0"
          :loading="busy === c.id"
          @click="withdraw(c)"
        >
          {{ t('deals.comments.withdraw') }}
        </v-btn>
      </article>
    </template>

    <!-- What the page puts after the input: the digests of it. -->
    <slot />
  </section>
</template>

<script setup lang="ts">
// Input that does not count as a vote. The committee sees it with names; a member
// sees only their own (server/utils/dealComments.ts decides). Decision 2026-10-22 §5.
interface Comment {
  id: string
  kind: string
  body: string
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  author?: { id: string; name: string }
}

const props = defineProps<{ slug: string; comments: Comment[]; isCommittee: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { $posthog } = useNuxtApp()

const kinds = ['comment', 'objection', 'suggestion', 'founder_question', 'signal']
// A link from elsewhere (the overview, a mail) preselects the kind: /member/caser/<slug>?innspill=objection#innspill
const route = useRoute()
const kind = ref(kinds.includes(String(route.query.innspill)) ? String(route.query.innspill) : 'comment')
const draft = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref('')
const busy = ref<string | null>(null)

function errorText(e: any) {
  return e?.data?.message || e?.message || t('deals.qa.error')
}

async function send() {
  error.value = ''
  sent.value = false
  sending.value = true
  try {
    await $fetch(`/api/member/deals/${props.slug}/comments`, {
      method: 'POST',
      body: { kind: kind.value, body: draft.value },
    })
    draft.value = ''
    sent.value = true
    $posthog?.capture?.('deal_comment_added', { slug: props.slug, kind: kind.value })
    emit('changed')
  } catch (e: any) {
    error.value = errorText(e)
  } finally {
    sending.value = false
  }
}

async function withdraw(c: Comment) {
  busy.value = c.id
  try {
    await $fetch(`/api/member/deals/${props.slug}/comments/${c.id}/withdraw`, { method: 'POST' })
    emit('changed')
  } catch (e: any) {
    error.value = errorText(e)
  } finally {
    busy.value = null
  }
}

function byline(c: Comment) {
  const date = formatDate(c.createdAt, 'short')
  if (c.author) return t('deals.comments.by', { name: c.author.name, date })
  return date
}
</script>

<style scoped>
.panel {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 32px 0 28px;
}
.panel-title {
  font-size: 1.2rem;
  font-weight: 650;
  color: #fff;
}
.meta {
  color: #888;
  font-size: 13px;
}
.ok-note {
  color: #81c784;
  font-size: 13px;
}
.kind {
  color: #bbb !important;
}
.kind-on {
  background: #fff !important;
  color: #111 !important;
}
.list-label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.comment {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px 0 4px;
}
.comment.withdrawn .c-body {
  color: #777;
  text-decoration: line-through;
}
.c-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  margin-bottom: 4px;
}
.kind-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 2px 7px;
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.kind-objection {
  color: #ef9a9a;
  border-color: rgba(239, 154, 154, 0.5);
}
.kind-signal {
  color: #90caf9;
  border-color: rgba(144, 202, 249, 0.5);
}
</style>
