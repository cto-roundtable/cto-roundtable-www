<template>
  <div class="invest-doc text-left">
    <NuxtLink :to="`/member/invest/${slug}`" class="back-link">
      <v-icon size="16">mdi-arrow-left</v-icon> {{ t('invest.documents.back') }}
    </NuxtLink>

    <h1 class="font-weight-bold my-3" style="font-size: 1.4rem;">{{ title || t('invest.documents.loading') }}</h1>

    <v-alert v-if="missing" type="warning" variant="outlined">{{ t('invest.documents.missing') }}</v-alert>

    <!-- One slide at a time, links out in a new tab (components/document/DocumentViewer). -->
    <template v-else-if="checked && session.authenticated">
      <DocumentViewer ref="viewer" :src="src" :title="title" />
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
const viewer = ref<{ showAnchor: (id: string) => void } | null>(null)

// "Show the slide" on a comment: the viewer goes to it and comes into view.
function showAnchor(anchor: string) {
  viewer.value?.showAnchor(anchor)
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
.back-link {
  color: #ccc;
  font-size: 14px;
  text-decoration: none;
}
.back-link:hover {
  color: #fff;
}
</style>
