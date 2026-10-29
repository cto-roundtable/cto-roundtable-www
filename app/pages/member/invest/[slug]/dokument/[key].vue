<template>
  <div class="invest-doc text-left">
    <NuxtLink :to="`/member/invest/${slug}`" class="back-link">
      <v-icon size="16">mdi-arrow-left</v-icon> {{ t('invest.documents.back') }}
    </NuxtLink>

    <div class="d-flex align-center justify-space-between flex-wrap my-3" style="gap: 12px;">
      <h1 class="font-weight-bold mb-0" style="font-size: 1.4rem;">{{ title || t('invest.documents.loading') }}</h1>
      <a :href="src" target="_blank" rel="noopener" class="full-link">
        {{ t('invest.documents.fullScreen') }} <v-icon size="14">mdi-open-in-new</v-icon>
      </a>
    </div>

    <v-alert v-if="missing" type="warning" variant="outlined">{{ t('invest.documents.missing') }}</v-alert>

    <!-- The document is served with a sandboxing CSP as well (no scripts, opaque origin);
         the iframe sandbox says the same, so neither alone has to be right. -->
    <template v-else-if="checked && session.authenticated">
      <iframe
        ref="frame"
        :src="frameSrc"
        :title="title"
        class="doc-frame"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
      />
      <InvestDocumentComments :slug="slug" :doc-key="key" @show-anchor="showAnchor" />
    </template>
  </div>
</template>

<script setup lang="ts">
// One offering document (the deck) inside the portal, behind login, so the invitation
// can link here instead of to a share link that expires.
definePageMeta({ layout: 'member' })

const { t } = useI18n()
const route = useRoute()
const { session, checked } = useAuthSession()

const slug = computed(() => String(route.params.slug))
const key = computed(() => String(route.params.key))
const src = computed(() => `/api/member/invest/${slug.value}/documents/${key.value}`)
const title = ref('')
const missing = ref(false)
const frame = ref<HTMLIFrameElement | null>(null)
// "Show the slide" on a comment: a fragment navigation in the frame (no reload, and no
// script in the document needed), then the frame into view.
const fragment = ref('')
const frameSrc = computed(() => (fragment.value ? `${src.value}#${fragment.value}` : src.value))

function showAnchor(anchor: string) {
  fragment.value = anchor
  frame.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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
.back-link,
.full-link {
  color: #ccc;
  font-size: 14px;
  text-decoration: none;
}
.back-link:hover,
.full-link:hover {
  color: #fff;
}
.doc-frame {
  /* "Show the slide" scrolls the frame into view: keep it clear of the fixed app bar. */
  scroll-margin-top: 64px;
  width: 100%;
  height: 80vh;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: #fff;
}
</style>
