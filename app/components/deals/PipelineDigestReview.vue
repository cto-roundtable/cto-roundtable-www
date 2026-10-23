<template>
  <article class="review">
    <div class="d-flex align-center flex-wrap mb-2" style="gap: 10px;">
      <span class="title">{{ t('deals.pipelineDigest.draftTitle', { group: digest.group.name, date: formatDate(digest.periodStart, 'short') }) }}</span>
      <span class="tag">{{ t('deals.pipelineDigest.waiting') }}</span>
    </div>
    <p class="meta mb-3">{{ t('deals.pipelineDigest.draftIntro', { who: madeBy }) }}</p>

    <v-textarea
      v-if="editing"
      v-model="text"
      rows="8"
      auto-grow
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      theme="dark"
      class="mb-3"
    />
    <!-- Rendered from a strict, escape-first markdown subset (no raw HTML). -->
    <div v-else class="d-body mb-3" v-html="renderMarkdown(digest.bodyMd)" />

    <div class="d-flex align-center flex-wrap" style="gap: 10px;">
      <v-btn :loading="busy === 'approve'" style="background-color: white; color: #111;" @click="approve">
        {{ editing ? t('deals.pipelineDigest.approveEdited') : t('deals.pipelineDigest.approve') }}
      </v-btn>
      <v-btn v-if="!editing" variant="outlined" @click="startEdit">{{ t('deals.pipelineDigest.edit') }}</v-btn>
      <v-btn v-if="!rejecting" variant="text" @click="rejecting = true">{{ t('deals.pipelineDigest.reject') }}</v-btn>
    </div>
    <form v-if="rejecting" class="mt-3" @submit.prevent="reject">
      <v-text-field
        v-model="reason"
        :label="t('deals.pipelineDigest.rejectReason')"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        theme="dark"
      />
      <v-btn type="submit" class="mt-2" variant="outlined" :disabled="!reason.trim()" :loading="busy === 'reject'">
        {{ t('deals.pipelineDigest.rejectConfirm') }}
      </v-btn>
    </form>
    <v-alert v-if="error" type="warning" variant="outlined" density="compact" class="mt-3">{{ error }}</v-alert>
  </article>
</template>

<script setup lang="ts">
// A draft of the pipeline digest (every second Monday) waiting for a committee member
// for the first four weeks; after that drafts are approved on their own
// (server/utils/pipelineDigests.ts, dc-33 H4).
interface PipelineDigest {
  id: string
  group: { slug: string; name: string }
  periodStart: string
  bodyMd: string
  madeBy: string
}
const props = defineProps<{ digest: PipelineDigest }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const { formatDate } = useLocaleDate()
const { $posthog } = useNuxtApp()
const editing = ref(false)
const text = ref('')
const rejecting = ref(false)
const reason = ref('')
const busy = ref<'approve' | 'reject' | null>(null)
const error = ref('')

const madeBy = computed(() =>
  props.digest.madeBy.startsWith('agent:') ? t('deals.digest.agent') : props.digest.madeBy,
)

function startEdit() {
  text.value = props.digest.bodyMd
  editing.value = true
}

async function post(action: 'approve' | 'reject', body: Record<string, unknown>) {
  error.value = ''
  busy.value = action
  try {
    await $fetch(`/api/member/committee/pipeline-digests/${props.digest.id}/${action}`, { method: 'POST', body })
    $posthog?.capture?.(`pipeline_digest_${action === 'approve' ? 'approved' : 'rejected'}`, { edited: editing.value })
    emit('changed')
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || t('deals.qa.error')
  } finally {
    busy.value = null
  }
}

const approve = () => post('approve', editing.value ? { bodyMd: text.value } : {})
const reject = () => post('reject', { reason: reason.value })
</script>

<style scoped>
.review {
  background: #161616;
  border: 1px solid rgba(255, 183, 77, 0.5);
  border-radius: 8px;
  padding: 18px 20px;
}
.title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
}
.tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #111;
  background: #ffb74d;
  border-radius: 4px;
  padding: 2px 7px;
}
.meta {
  color: #888;
  font-size: 13px;
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
</style>
