<template>
  <div class="preview-bar" role="status">
    <v-icon size="18" class="eye" aria-hidden="true">mdi-eye-outline</v-icon>
    <div class="text">
      <p class="line">{{ t('deals.preview.showing') }}</p>
      <p class="hint">{{ t('deals.preview.hint') }}</p>
    </div>
    <v-select
      :model-value="current"
      :items="items"
      :aria-label="t('deals.preview.choose')"
      density="compact"
      variant="outlined"
      hide-details
      theme="dark"
      class="role-select"
      @update:model-value="choose"
    />
    <NuxtLink :to="{ path: route.path, query: {} }" class="exit">{{ t('deals.preview.exit') }}</NuxtLink>
  </div>
</template>

<script setup lang="ts">
// "Se som ...": the committee sees a page exactly as a role does (the server answers
// as that role, ?som=). Read-only: forms on the case page are inert while previewing.
interface Role {
  slug: string
  name: string | null
  phase: string | null
}
const props = defineProps<{ roles: Role[]; current: string }>()

const { t } = useI18n()
const route = useRoute()

const items = computed(() => props.roles.map((r) => ({ value: r.slug, title: roleLabel(t, r) })))

function choose(slug: string) {
  navigateTo({ path: route.path, query: { som: slug } }, { replace: true })
}
</script>

<style scoped>
.preview-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  background: #1b1b1b;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 28px;
}
.eye {
  color: #ddd;
}
.text {
  flex: 1 1 260px;
  min-width: 0;
}
.line {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.hint {
  color: #aaa;
  font-size: 13px;
  margin: 2px 0 0;
}
.role-select {
  flex: 0 1 300px;
  min-width: 220px;
}
.exit {
  color: #fff;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
}
</style>
