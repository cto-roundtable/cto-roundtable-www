<template>
  <div class="text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">Min aktivitet</h1>
      <p style="color: #aaa; font-size: 14px;">
        Din aktivitet fra Slack (poster, tråd-svar, reaksjoner) og Luma (oppmøte + hosting),
        siste 12 måneder.
      </p>
    </header>

    <MemberActivityDetail v-if="session.personId" :person-id="session.personId" context="self" />
    <div v-else-if="!loading" style="color: #aaa;">Logg inn for å se din aktivitet.</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { session, loading, checkSession } = useAuthSession()
onMounted(checkSession)
</script>
