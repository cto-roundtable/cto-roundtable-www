<template>
  <div v-if="!loading && data" class="ai-onboarding text-left">
    <header class="mb-6">
      <div class="d-flex align-center flex-wrap mb-2" style="gap: 12px;">
        <h1 class="font-weight-bold mb-0" style="font-size: 1.6rem;">AI-onboarding</h1>
        <v-chip color="#4caf50" variant="flat" size="small" class="font-weight-bold">
          {{ data.roleLabel }}
        </v-chip>
      </div>
      <p style="color: #aaa; font-size: 14px;">
        Koble Claude Code til CTO Roundtable-verktøyene. Prompten under er tilpasset rollen din.
      </p>
    </header>

    <section class="mb-8">
      <h2 class="section-title">Før du starter</h2>
      <ul class="prereq-list">
        <li>GitHub-konto med akseptert invitasjon til <code>cto-roundtable</code>-org</li>
        <li>
          <a href="https://claude.com/claude-code" target="_blank" rel="noopener" class="link">
            Claude Code
          </a>
          installert
        </li>
      </ul>
    </section>

    <section class="mb-8">
      <h2 class="section-title">Dette blir satt opp for deg</h2>
      <ul class="prereq-list">
        <li v-for="tool in data.tools" :key="tool">{{ tool }}</li>
      </ul>
    </section>

    <section class="mb-8">
      <div class="d-flex align-center justify-space-between flex-wrap mb-3" style="gap: 12px;">
        <h2 class="section-title mb-0">Din prompt</h2>
        <v-btn
          size="small"
          variant="outlined"
          :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
          style="color: #fff; border-color: rgba(255,255,255,0.3);"
          @click="copyPrompt"
        >
          {{ copied ? 'Kopiert!' : 'Kopier prompt' }}
        </v-btn>
      </div>
      <pre class="prompt-block">{{ data.prompt }}</pre>
    </section>

    <section class="mb-8">
      <h2 class="section-title">Slik gjør du det</h2>
      <ol class="steps-list">
        <li>Start <code>claude</code> i en terminal</li>
        <li>Lim inn prompten og følg stegene</li>
      </ol>
    </section>
  </div>

  <div v-else class="d-flex justify-center py-12">
    <v-progress-circular indeterminate color="white" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

interface OnboardingData {
  name: string
  role: string
  roleLabel: string
  isBoard: boolean
  tools: string[]
  prompt: string
}

const { session, checked } = useAuthSession()
const { $posthog } = useNuxtApp()

const loading = ref(true)
const data = ref<OnboardingData | null>(null)
const copied = ref(false)

watchEffect(async () => {
  if (checked.value && session.value.authenticated && loading.value) {
    data.value = await $fetch<OnboardingData>('/api/member/onboarding')
    loading.value = false
    $posthog?.capture?.('ai_onboarding_viewed', {
      role: data.value.role,
      is_board: data.value.isBoard,
    })
  }
})

async function copyPrompt() {
  if (!data.value) return
  try {
    await navigator.clipboard.writeText(data.value.prompt)
    copied.value = true
    $posthog?.capture?.('ai_onboarding_prompt_copied', { role: data.value.role })
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // clipboard not available; ignore
  }
}
</script>

<style scoped>
.ai-onboarding {
  line-height: 1.7;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.prereq-list,
.steps-list {
  color: rgba(255, 255, 255, 0.85);
  padding-left: 1.4rem;
}

.prereq-list li,
.steps-list li {
  margin-bottom: 6px;
}

.prompt-block {
  background: #0d0d0d;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 16px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

code {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.9em;
}

.link {
  color: #fff;
}
</style>
