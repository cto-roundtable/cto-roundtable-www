<template>
  <div class="sweden-faq text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.sweden.faq.title') }}</h1>
      <p style="color: #aaa; font-size: 14px;">{{ t('member.sweden.faq.intro') }}</p>
    </header>

    <!-- Only what is decided. The fee and the legal entity are not, so they are
         left out on purpose (decision sweden-portal-scope, H7). -->
    <section v-for="key in QUESTIONS" :key="key" class="mb-6">
      <h2 class="font-weight-bold mb-2" style="font-size: 1.1rem;">{{ t(`member.sweden.faq.${key}.q`) }}</h2>
      <p>{{ t(`member.sweden.faq.${key}.a`) }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { t } = useI18n()

const QUESTIONS = ['how', 'who', 'norway', 'question'] as const
</script>

<style scoped>
.sweden-faq {
  line-height: 1.8;
}
</style>
