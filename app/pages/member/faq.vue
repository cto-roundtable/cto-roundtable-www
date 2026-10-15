<template>
  <div class="member-faq text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">{{ t('member.faq.title') }}</h1>
      <p style="color: #aaa; font-size: 14px;">
        {{ t('member.faq.intro') }}
      </p>
    </header>

    <section class="mb-8">
      <h2 class="font-weight-bold mb-3">{{ t('member.faq.activity.heading') }}</h2>
      <p>{{ t('member.faq.activity.lead') }}</p>
      <ul class="mt-2">
        <li>
          <strong>{{ t('member.faq.activity.attend.title') }}</strong> {{ t('member.faq.activity.attend.body') }}
        </li>
        <li>
          <strong>{{ t('member.faq.activity.slack.title') }}</strong> {{ t('member.faq.activity.slack.body') }}
        </li>
        <li>
          <strong>{{ t('member.faq.activity.absence.title') }}</strong> {{ t('member.faq.activity.absence.body') }}
        </li>
      </ul>
      <p class="mt-3">
        {{ t('member.faq.activity.review') }}
      </p>
    </section>

    <section class="mb-8">
      <h2 class="font-weight-bold mb-3">{{ t('member.faq.retirement.heading') }}</h2>
      <p>
        {{ t('member.faq.retirement.body') }}
      </p>

      <h3 class="font-weight-bold mt-4 mb-2">{{ t('member.faq.retirement.meaningHeading') }}</h3>
      <ul>
        <li>{{ t('member.faq.retirement.meaning.slack') }}</li>
        <li>{{ t('member.faq.retirement.meaning.events') }}</li>
        <li>{{ t('member.faq.retirement.meaning.vote') }}</li>
        <li>{{ t('member.faq.retirement.meaning.rejoin') }}</li>
      </ul>

      <h3 class="font-weight-bold mt-4 mb-2">{{ t('member.faq.reinstatement.heading') }}</h3>
      <p>
        {{ t('member.faq.reinstatement.body') }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })

const { t } = useI18n()
</script>

<style scoped>
.member-faq {
  line-height: 1.8;
}

.member-faq h2 {
  margin-top: 1.5rem;
  font-size: 1.5rem;
}

.member-faq h3 {
  font-size: 1.15rem;
}

.member-faq p {
  margin-bottom: 0.75rem;
  font-size: 16px;
}

.member-faq ul {
  margin-left: 1.5rem;
  margin-bottom: 1rem;
}

.member-faq ul li {
  margin-bottom: 0.5rem;
}
</style>
