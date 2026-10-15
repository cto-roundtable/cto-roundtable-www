<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        variant="text"
        size="small"
        prepend-icon="mdi-translate"
        style="color: #999;"
        :aria-label="t('layout.language')"
      >
        {{ locale.toUpperCase() }}
      </v-btn>
    </template>
    <v-list density="compact">
      <v-list-item
        v-for="option in options"
        :key="option.code"
        :active="option.code === locale"
        :title="option.name"
        :lang="option.code"
        @click="choose(option.code)"
      />
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
// The member portal's language picker. Each language is named in itself, so a
// member can find theirs whatever the portal is showing right now.
import type { MemberLocale } from '~/composables/useMemberLocale'

const { t } = useI18n()
const { locale, choose } = useMemberLocale()

const options: { code: MemberLocale; name: string }[] = [
  { code: 'nb', name: 'Norsk' },
  { code: 'en', name: 'English' },
  { code: 'sv', name: 'Svenska' },
]
</script>
