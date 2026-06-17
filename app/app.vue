<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
// Global title template. Pages without their own title render just
// "CTO Roundtable"; pages that set a title render "<title> - CTO Roundtable".
// (A function template lives here because nuxt.config can't serialize one.)
useHead({
  titleTemplate: (title) =>
    !title || title === 'CTO Roundtable' ? 'CTO Roundtable' : `${title} - CTO Roundtable`,
})
</script>
