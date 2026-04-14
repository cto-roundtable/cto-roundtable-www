<template>
  <div class="member-faq text-left">
    <header class="mb-6">
      <h1 class="font-weight-bold mb-2" style="font-size: 1.6rem;">FAQ</h1>
      <p style="color: #aaa; font-size: 14px;">
        Aktivitetskrav og pensjonering.
      </p>
    </header>

    <section class="mb-8">
      <h2 class="font-weight-bold mb-3">Aktivitetskrav</h2>
      <p>For å opprettholde et aktivt og verdifullt fellesskap, forventes medlemmer å:</p>
      <ul class="mt-2">
        <li>
          <strong>Delta på minst 2 samlinger per år.</strong> Samlinger inkluderer fysiske møter,
          workshops og sosiale arrangementer.
        </li>
        <li>
          <strong>Være aktiv i Slack-kanalen.</strong> Bidra til diskusjoner, del erfaringer og
          still spørsmål.
        </li>
        <li>
          <strong>Gi beskjed ved fravær.</strong> Hvis du vet at du kommer til å være mindre
          aktiv en periode, gi styret beskjed.
        </li>
      </ul>
      <p class="mt-3">
        Styret vurderer aktivitetsnivå jevnlig. Hvis kravene ikke oppfylles over tid, kan styret
        ta kontakt for en samtale om veien videre.
      </p>
    </section>

    <section class="mb-8">
      <h2 class="font-weight-bold mb-3">Pensjonering</h2>
      <p>
        Et medlem som over lengre tid ikke oppfyller aktivitetskravene kan pensjoneres av styret.
        Pensjonering er ikke en straff, men en anerkjennelse av at livet og prioriteringene
        endrer seg.
      </p>

      <h3 class="font-weight-bold mt-4 mb-2">Hva pensjonering innebærer</h3>
      <ul>
        <li>
          Du beholder tilgang til Slack, men mister tilgang til private kanaler og flyttes til en
          pensjonert-rolle.
        </li>
        <li>Du kan ikke delta på roundtable-samlinger, men er velkommen på sosiale arrangementer.</li>
        <li>Du har ikke stemmerett på årsmøte.</li>
        <li>Du kan når som helst søke styret om gjenopptak av aktivt medlemskap.</li>
      </ul>

      <h3 class="font-weight-bold mt-4 mb-2">Gjenopptak</h3>
      <p>
        Ønsker du å bli aktivt medlem igjen? Ta kontakt med styret. Vi vurderer gjenopptak basert
        på din intensjon og kapasitet til å delta aktivt.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'member' })
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
