<template>
  <div class="company-updates text-left">
    <NuxtLink to="/member/updates" class="back-link mb-4 d-inline-flex align-center">
      <v-icon size="16" class="mr-1">mdi-arrow-left</v-icon> Alle oppdateringer
    </NuxtLink>

    <div v-if="loading" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="white" />
    </div>

    <template v-else-if="data">
      <header class="mb-6">
        <h1 class="font-weight-bold mb-1" style="font-size: 1.6rem;">{{ data.company }}</h1>
        <p style="color: #aaa; font-size: 14px;">
          {{ data.updates.length }} {{ data.updates.length === 1 ? 'oppdatering' : 'oppdateringer' }}
        </p>
      </header>

      <article v-for="u in data.updates" :id="`update-${u.id}`" :key="u.id" class="update-card mb-4">
        <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px;">
          <v-chip
            v-if="u.kind === 'notice'"
            color="#ff9800"
            variant="flat"
            size="x-small"
            class="text-uppercase font-weight-bold"
          >
            Notis
          </v-chip>
          <span class="update-date">{{ formatDate(u.updateDate) }}</span>
        </div>

        <h2 class="update-title mb-3">{{ u.title }}</h2>

        <!-- Body is rendered from a strict, escape-first markdown subset (no raw HTML). -->
        <div class="update-body" v-html="renderMarkdown(u.bodyMd)" />

        <div v-if="u.attachments.length" class="attachments mt-4">
          <p class="attachments-label mb-2">Vedlegg</p>
          <a
            v-for="a in u.attachments"
            :key="a.id"
            :href="`/api/member/updates/attachment/${a.id}`"
            target="_blank"
            rel="noopener"
            class="attachment-pill"
          >
            <v-icon size="14" class="mr-1">mdi-paperclip</v-icon>
            <span>{{ a.filename }}</span>
            <span v-if="a.sizeBytes" class="att-size">{{ formatSize(a.sizeBytes) }}</span>
          </a>
        </div>
      </article>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface Attachment {
  id: string
  filename: string
  mime: string | null
  sizeBytes: number | null
}
interface Update {
  id: string
  kind: 'update' | 'notice'
  updateDate: string
  title: string
  headline: string | null
  bodyMd: string
  summaryMd: string | null
  attachments: Attachment[]
}
interface CompanyUpdates {
  company: string
  slug: string
  updates: Update[]
}

const route = useRoute()
const slug = route.params.slug as string
const { session, checked } = useAuthSession()
const loading = ref(true)
const data = ref<CompanyUpdates | null>(null)
const { $posthog } = useNuxtApp()

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    try {
      data.value = await $fetch<CompanyUpdates>(`/api/member/updates/${slug}`)
      $posthog?.capture?.('investor_update_company_viewed', {
        slug,
        update_count: data.value.updates.length,
      })
    } catch (e: any) {
      // 403 (not in a funding cohort) or 404 → bounce to the list.
      await navigateTo('/member/updates')
      return
    } finally {
      loading.value = false
    }
  }
})

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('nb-NO', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

.update-card {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 22px;
  /* Land a #update-<id> deep-link below the sticky header, not flush to it. */
  scroll-margin-top: 88px;
}

.update-date {
  color: #888;
  font-size: 13px;
}

.update-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.35;
}

.update-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
}
.update-body :deep(p) {
  margin: 0 0 12px;
}
.update-body :deep(p.upd-h) {
  margin: 16px 0 8px;
  color: #fff;
}
.update-body :deep(ul) {
  margin: 0 0 12px;
  padding-left: 20px;
}
.update-body :deep(li) {
  margin-bottom: 4px;
}
.update-body :deep(a) {
  color: #64b5f6;
}

.attachments {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 14px;
}
.attachments-label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.attachment-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 6px 12px;
  margin: 0 8px 8px 0;
  font-size: 13px;
  color: #fff;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.04);
}
.attachment-pill:hover {
  background: rgba(255, 255, 255, 0.1);
}
.att-size {
  color: #888;
  font-size: 11px;
  margin-left: 4px;
}
</style>
