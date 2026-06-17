<template>
  <v-container fluid class="sweden-page">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="7" class="content">
        <p class="eyebrow">CTO Roundtable Sweden</p>
        <h1 class="headline">A small, tight-knit network of Stockholm CTOs</h1>
        <p class="lead">
          We are starting a Swedish chapter of the CTO Roundtable, built on the same model we
          have run in Norway for years. This page is just to register interest. You are not
          signing up for an event, and you are not committing to anything yet. We are gathering
          the first people who want to be part of it.
        </p>

        <section class="block">
          <h2>What we are building</h2>
          <p>
            A room of CTOs who meet to talk shop and share knowledge, roughly six times a year.
            One company hosts (a meeting room with space for 8 to 12 people is enough, no big
            budget needed), someone puts their own tech on the grill, and the rest of us ask
            questions and help work through the hard problems. It is low-threshold show and tell,
            not a polished sales pitch. No panels, no audience. Just peers.
          </p>
          <p>
            And it is about half social, half technical. The dinner and the beer (or something
            alcohol-free) matter as much as the deep dive. These are the things you cannot post
            on LinkedIn, talked about openly between people who trust each other.
          </p>
        </section>

        <section class="block">
          <h2>Our principles</h2>
          <ul>
            <li>
              <strong>Close relationships over a big network.</strong> Deep relationships give
              better support, safety and more valuable conversations. We prioritise a tight
              community, not just a large network. Social meetups matter as much as the technical
              ones. This is a network for lasting relationships, where we grow together over time.
            </li>
            <li>
              <strong>Sharing, openness and support.</strong> We share generously: experience,
              know-how, problems and solutions, including the times we failed. We operate under
              Chatham House rules, built on trust and respect. We cheer each other on, and we want
              the Swedish startup scene to grow.
            </li>
            <li>
              <strong>Engage. You get out what you put in.</strong> Be active on Slack and in the
              meetings. We use Slack as the daily home base to stay in touch. Offer help, and do
              not be afraid to ask for it yourself.
            </li>
            <li>
              <strong>CTOs only.</strong> The Stockholm room is for sitting CTOs. Everyone carries
              real technical ownership, and that is what keeps the conversation honest and useful.
            </li>
            <li>
              <strong>Swedish first, with a small bridge to Norway.</strong> The Stockholm chapter
              is its own thing, run locally, with its own private space. There is a light bridge
              to the Norwegian network for cross-pollination and dealflow, but it stays separate
              so neither side dilutes the other.
            </li>
          </ul>
        </section>

        <section class="block">
          <h2>What happens next</h2>
          <p>
            We want to move forward with the first 10 to 15 people to start the network. Once we
            have enough of the right people, we set a date for the first gathering, planned for
            early autumn. More information comes once you have signed up. Expect to hear from us
            with concrete details toward the end of August.
          </p>
          <p>
            So for now: leave your details below if you want in. That is the whole ask.
          </p>
        </section>

        <section class="block">
          <h2>Who we are</h2>
          <p>
            CTO Roundtable is a Norwegian network of CTOs from scale-ups and growth companies
            (Kahoot, Ardoq and others). See the people and what we do at
            <a href="https://www.ctoroundtable.no" target="_blank" rel="noopener">ctoroundtable.no</a>.
          </p>
        </section>

        <section class="block form-block">
          <h2>Register your interest</h2>

          <div v-if="submitted" class="success">
            <p class="success-title">Thanks, you are on the list.</p>
            <p>
              We will be in touch toward the end of August with details on the first Stockholm
              gathering. In the meantime, feel free to point any peers you would want in the room
              to this page.
            </p>
          </div>

          <form v-else class="form" @submit.prevent="submit">
            <!-- honeypot: hidden from real users -->
            <input
              v-model="form.website"
              class="hp"
              type="text"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
            >

            <label class="field">
              <span class="label">Name <i>*</i></span>
              <input v-model="form.name" type="text" required>
            </label>

            <label class="field">
              <span class="label">Email <i>*</i></span>
              <input v-model="form.email" type="email" required>
            </label>

            <label class="field">
              <span class="label">LinkedIn <i>*</i></span>
              <input v-model="form.linkedin" type="url" placeholder="https://linkedin.com/in/..." required>
            </label>

            <label class="field">
              <span class="label">Company</span>
              <input v-model="form.company" type="text">
            </label>

            <label class="field">
              <span class="label">Why do you want to join?</span>
              <textarea v-model="form.why" rows="3" />
            </label>

            <p v-if="error" class="error">{{ error }}</p>

            <button type="submit" :disabled="loading" class="submit">
              {{ loading ? 'Sending...' : 'Register interest' }}
            </button>
          </form>
        </section>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
useHead({ title: 'Sweden' })

const form = reactive({
  name: '',
  email: '',
  linkedin: '',
  company: '',
  why: '',
  website: '', // honeypot
})

const loading = ref(false)
const submitted = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/sweden/join', { method: 'POST', body: { ...form } })
    submitted.value = true
  } catch (e: any) {
    error.value = e?.data?.message || 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.sweden-page {
  padding: 5rem 1rem 4rem;
}

.content {
  text-align: left;
  line-height: 1.7;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 13px;
  color: #888;
  margin-bottom: 0.5rem;
}

.headline {
  font-size: 2.4rem;
  font-weight: 600;
  line-height: 1.2;
  margin-bottom: 1.25rem;
}

.lead {
  font-size: 1.15rem;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 2rem;
}

.block {
  margin-bottom: 2.25rem;
}

.block h2 {
  font-size: 1.4rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.block p {
  margin-bottom: 0.85rem;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
}

.block ul {
  margin: 0 0 0 1.25rem;
}

.block li {
  margin-bottom: 0.75rem;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
}

a {
  color: #fff;
  text-decoration: underline;
}

.form-block {
  border-top: 1px solid #2a2a2a;
  padding-top: 2rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 520px;
}

.field {
  display: flex;
  flex-direction: column;
}

.label {
  font-size: 14px;
  color: #bbb;
  margin-bottom: 0.35rem;
}

.label i {
  color: #e57373;
  font-style: normal;
}

.field input,
.field textarea {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 0.65rem 0.75rem;
  color: #fff;
  font-size: 16px;
  font-family: inherit;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: #777;
}

.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.submit {
  align-self: flex-start;
  background: #fff;
  color: #111;
  border: none;
  border-radius: 6px;
  padding: 0.7rem 1.6rem;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 0.5rem;
}

.submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  color: #e57373;
  font-size: 14px;
}

.success {
  background: #1a1a1a;
  border: 1px solid #2f5a2f;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
}

.success-title {
  font-weight: 600;
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  color: #fff;
}
</style>
