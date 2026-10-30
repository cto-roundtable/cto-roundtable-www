<template>
  <transition name="consent-slide">
    <aside v-if="show" class="consent-banner" role="dialog" aria-live="polite" :aria-label="t('consent.title')">
      <p class="consent-title mb-1">{{ t('consent.title') }}</p>
      <p class="consent-body mb-2">{{ t('consent.body') }}</p>
      <p class="consent-fine mb-3">
        {{ t('consent.fine') }}
        <NuxtLink to="/privacy" class="consent-link">{{ t('consent.privacy') }}</NuxtLink>
      </p>
      <div class="consent-actions">
        <v-btn size="small" variant="flat" style="background-color: #fff; color: #111;" @click="consent.accept()">
          {{ t('consent.accept') }}
        </v-btn>
        <v-btn size="small" variant="text" color="white" @click="consent.decline()">
          {{ t('consent.decline') }}
        </v-btn>
      </div>
    </aside>
  </transition>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { $analyticsConsent: consent } = useNuxtApp()

// Client-only: the choice lives in local storage, so the server never knows it and
// rendering it there would flash the banner at people who already answered.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const show = computed(() => mounted.value && consent?.enabled && consent.status.value === null)
</script>

<style scoped>
.consent-banner {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2400;
  max-width: 380px;
  padding: 18px 20px;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: #fff;
  text-align: left;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}

@media (max-width: 600px) {
  .consent-banner {
    left: 12px;
    right: 12px;
    bottom: 12px;
    max-width: none;
  }
}

.consent-title {
  font-weight: 700;
  font-size: 15px;
}

.consent-body {
  color: #ddd;
  font-size: 14px;
  line-height: 1.5;
}

.consent-fine {
  color: #999;
  font-size: 12px;
  line-height: 1.5;
}

.consent-link {
  color: #bbb;
}

.consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.consent-slide-enter-active,
.consent-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.consent-slide-enter-from,
.consent-slide-leave-to {
  transform: translateY(16px);
  opacity: 0;
}
</style>
