<template>
  <div class="invest-doc text-left">
    <NuxtLink :to="`/member/invest/${slug}`" class="back-link">
      <v-icon size="16">mdi-arrow-left</v-icon> {{ t('invest.documents.back') }}
    </NuxtLink>

    <h1 class="font-weight-bold my-3" style="font-size: 1.4rem;">{{ title || t('invest.documents.loading') }}</h1>

    <v-alert v-if="missing" type="warning" variant="outlined">{{ t('invest.documents.missing') }}</v-alert>

    <!-- One slide at a time, links out in a new tab (components/document/DocumentViewer),
         with comments in it: huddle's review-kit bridge in the frame, our layer over it. -->
    <template v-else-if="checked && session.authenticated">
      <DocumentViewer ref="viewer" :src="src" :title="title" :scripts="frameScripts" @message="onFrame">
        <template #toolbar>
          <v-btn
            size="small"
            :variant="commenting ? 'flat' : 'text'"
            :color="commenting ? 'white' : undefined"
            :icon="mobile ? 'mdi-comment-plus-outline' : undefined"
            :prepend-icon="mobile ? undefined : 'mdi-comment-plus-outline'"
            :aria-pressed="commenting"
            :aria-label="t('invest.comments.inline.toggle')"
            :title="t('invest.comments.inline.toggleHint')"
            class="comment-toggle"
            @click="commenting = !commenting"
          >
            <template v-if="!mobile">{{ t('invest.comments.inline.toggle') }}</template>
          </v-btn>
        </template>
        <template #overlay>
          <InvestDeckCommentLayer ref="layer" :comments="comments" :viewer="viewer" :commenting="commenting" />
        </template>
      </DocumentViewer>
      <InvestDocumentComments :comments="comments" @show="showThread" />
    </template>
  </div>
</template>

<script setup lang="ts">
// One offering document (the deck) inside the portal, behind login, so the invitation
// can link here instead of to a share link that expires. Members comment in it
// (InvestDeckCommentLayer) and under it (InvestDocumentComments), on one set of comments.
import { useDisplay } from 'vuetify'
import type { DocumentThread } from '~/composables/useDocumentComments'
import bridge from '~/vendor/huddle-review-kit/review-bridge.js?raw'

definePageMeta({ layout: 'member' })

const { t } = useI18n()
const route = useRoute()
const { session, checked } = useAuthSession()

const slug = computed(() => String(route.params.slug))
const key = computed(() => String(route.params.key))
const src = computed(() => `/api/member/invest/${slug.value}/documents/${key.value}`)
const title = ref('')
const missing = ref(false)
const { mobile } = useDisplay()
const frameScripts = [bridge]
const viewer = ref<any>(null)
const layer = ref<{ onFrame: (m: Record<string, unknown>) => void; open: (id: string) => void } | null>(null)
// "Kommenter": a tap in the deck comments on what it hits. Off, the deck is just read
// (selected words still get a "Kommenter" chip).
const commenting = ref(false)
const comments = useDocumentComments(slug, key)

function onFrame(m: Record<string, unknown>) {
  layer.value?.onFrame(m)
}

// "Show" on a comment in the list: the viewer comes into view on its slide, the thread opens there.
function showThread(th: DocumentThread) {
  const slide = th.slide ?? th.anchor
  if (slide && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(slide)) viewer.value?.showAnchor(slide)
  layer.value?.open(th.id)
}

watch(
  () => checked.value && session.value.authenticated,
  (ok) => {
    if (ok && !comments.loaded.value) comments.load().catch(() => {})
  },
  { immediate: true },
)

watchEffect(async () => {
  if (!checked.value || !session.value.authenticated || title.value || missing.value) return
  try {
    const page = await $fetch<{ documents: { key: string; title: string }[] }>(`/api/member/invest/${slug.value}`)
    const doc = page.documents.find((d) => d.key === key.value)
    if (doc) title.value = doc.title
    else missing.value = true
  } catch {
    missing.value = true
  }
})
</script>

<style scoped>
.back-link {
  color: #ccc;
  font-size: 14px;
  text-decoration: none;
}
.back-link:hover {
  color: #fff;
}
</style>
