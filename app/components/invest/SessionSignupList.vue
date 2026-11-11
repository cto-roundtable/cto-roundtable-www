<template>
  <section id="invest-session-list" class="mb-8">
    <h2 class="section-title">{{ t('invest.session.list.heading', { n: rows.length }) }}</h2>
    <p class="intro mb-4">{{ t('invest.session.list.intro') }}</p>

    <p v-if="!rows.length" class="muted">{{ t('invest.session.list.empty') }}</p>

    <template v-else>
      <v-card variant="outlined" class="pa-4 mb-4">
        <p class="field-label">{{ t('invest.session.list.emailsLabel', { n: emails.length }) }}</p>
        <v-textarea
          :model-value="emailText"
          readonly
          rows="2"
          auto-grow
          variant="outlined"
          density="compact"
          hide-details
          class="mb-3 emails"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
        <v-btn
          size="large"
          block
          class="text-none copy-btn"
          style="background-color: white; color: #111;"
          prepend-icon="mdi-content-copy"
          @click="copy"
        >
          {{ t('invest.session.list.copy') }}
        </v-btn>
        <p v-if="copied" class="muted mt-2 mb-0">{{ copied }}</p>
        <p v-if="withoutEmail" class="muted mt-2 mb-0">{{ t('invest.session.list.noEmail', { n: withoutEmail }) }}</p>
      </v-card>

      <ul class="signups">
        <li v-for="(r, i) in rows" :key="`${r.name}-${i}`" class="signup">
          <div class="d-flex flex-wrap align-center" style="gap: 6px 10px;">
            <span class="font-weight-bold" style="color: #fff;">{{ r.name }}</span>
            <v-chip size="small" variant="outlined" :color="r.answer === 'yes' || r.answer === 'committed' ? 'success' : undefined">
              {{ t(`invest.session.list.answer.${r.answer ?? 'none'}`) }}
            </v-chip>
          </div>
          <a v-if="r.email" :href="`mailto:${r.email}`" class="email">{{ r.email }}</a>
          <span v-else class="muted">{{ t('invest.session.list.missingEmail') }}</span>
          <p class="muted mb-0">{{ t('invest.session.list.signedUpAt', { date: formatDate(r.signedUpAt) }) }}</p>
          <p v-if="r.note" class="note mb-0">«{{ r.note }}»</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
// The committee's list of who wants an online info session (current-komite only: the
// API leaves it out for everyone else). Name, e-mail, when, the note, and whether they
// also answered the offering. The e-mails copy as one line for the To field of a mail.
interface Row {
  name: string
  email: string | null
  signedUpAt: string
  note: string | null
  answer: 'yes' | 'maybe' | 'no' | 'committed' | null
}

const props = defineProps<{ rows: Row[] }>()
const { t } = useI18n()
const { formatDate } = useLocaleDate()
const copied = ref('')

const emails = computed(() => props.rows.map((r) => r.email).filter((e): e is string => Boolean(e)))
const emailText = computed(() => emails.value.join(', '))
const withoutEmail = computed(() => props.rows.length - emails.value.length)

async function copy() {
  try {
    await navigator.clipboard.writeText(emailText.value)
    copied.value = t('invest.session.list.copied', { n: emails.value.length })
  } catch {
    copied.value = t('invest.session.list.copyFailed')
  }
}
</script>

<style scoped>
.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}
.intro {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
}
.field-label {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
}
.muted {
  color: #888;
  font-size: 13px;
}
.signups {
  list-style: none;
  padding: 0;
  margin: 0;
}
.signup {
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.email {
  color: #ccc;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.note {
  color: #ccc;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.copy-btn {
  letter-spacing: normal;
}
.emails :deep(textarea) {
  font-size: 13px;
}
</style>
