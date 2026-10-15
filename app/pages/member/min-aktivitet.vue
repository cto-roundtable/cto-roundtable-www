<template>
  <div class="text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.myActivity.title') }}</h1>
      <p style="color: #aaa; font-size: 14px;">
        {{ t('member.myActivity.intro') }}
      </p>
    </header>

    <MemberActivityDetail v-if="session.personId" :person-id="session.personId" context="self" />
    <div v-else-if="!loading" style="color: #aaa;">{{ t('member.myActivity.signInPrompt') }}</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { t } = useI18n()

const { session, loading, checkSession } = useAuthSession()
onMounted(checkSession)
</script>
