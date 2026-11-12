<template>
  <section id="invest-session-list" class="mb-10">
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

      <!-- Wide screens: one row per person. Phones: a card each, nothing to scroll sideways. -->
      <div v-if="!smAndDown" class="table-wrap">
        <v-table density="comfortable" class="committee-table">
          <thead>
            <tr>
              <th>{{ t('invest.session.list.col.name') }}</th>
              <th>{{ t('invest.session.list.col.email') }}</th>
              <th>{{ t('invest.session.list.col.note') }}</th>
              <th>{{ t('invest.session.list.col.signedUpAt') }}</th>
              <th>{{ t('invest.session.list.col.answer') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="`${r.name}-${i}`" class="signup">
              <td class="font-weight-bold">{{ r.name }}</td>
              <td>
                <a v-if="r.email" :href="`mailto:${r.email}`" class="email">{{ r.email }}</a>
                <span v-else class="muted">{{ t('invest.session.list.missingEmail') }}</span>
              </td>
              <td class="note">{{ r.note ?? '' }}</td>
              <td class="nowrap">{{ formatDate(r.signedUpAt, 'short') }}</td>
              <td>
                <v-chip size="small" variant="outlined" :color="positive(r.answer) ? 'success' : undefined">
                  {{ t(`invest.session.list.answer.${r.answer ?? 'none'}`) }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <ul v-else class="signups">
        <li v-for="(r, i) in rows" :key="`${r.name}-${i}`" class="signup">
          <div class="d-flex flex-wrap align-center" style="gap: 6px 10px;">
            <span class="font-weight-bold" style="color: #fff;">{{ r.name }}</span>
            <v-chip size="small" variant="outlined" :color="positive(r.answer) ? 'success' : undefined">
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
// API gives it to nobody else), on /member/invest/:slug/komite. Name, e-mail, the note,
// when, and whether they also answered the offering. The e-mails copy as one
// comma-separated line, ready for the guests of a calendar invite.
import { useDisplay } from 'vuetify'

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
const { smAndDown } = useDisplay()
const copied = ref('')

const emails = computed(() => props.rows.map((r) => r.email).filter((e): e is string => Boolean(e)))
const emailText = computed(() => emails.value.join(', '))
const withoutEmail = computed(() => props.rows.length - emails.value.length)
const positive = (a: Row['answer']) => a === 'yes' || a === 'committed'

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
.table-wrap {
  overflow-x: auto;
}
/* The portal's Vuetify theme is light; dark tables set their own colours (as on /member). */
.committee-table {
  background: transparent !important;
  color: #fff !important;
  font-size: 14px;
}
.committee-table :deep(th) {
  color: #aaa !important;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
}
.committee-table :deep(td) {
  color: #fff !important;
  vertical-align: top;
  padding-top: 10px !important;
  padding-bottom: 10px !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
}
.committee-table :deep(tr:hover td) {
  background: rgba(255, 255, 255, 0.05) !important;
}
.nowrap {
  white-space: nowrap;
}
.signups {
  list-style: none;
  padding: 0;
  margin: 0;
}
li.signup {
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
