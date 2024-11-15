  <template>
    <v-app>
      <v-main>
        <div class="landing-page">
          <Nuxt />
        </div>
      </v-main>
    </v-app>
  </template>


<style>
.landing-page {
  background-color: #111;
  color: #fff;
  height: 100vh; /* Ensures full viewport height */
}


.full-height {
  height: 100%; /* Centers content within the viewport */
}


.logo {
  margin: 0 auto;
}

h1 {
  font-size: 3.5rem;
  margin-bottom: 1rem;
}

h2 {
  margin-top: 2rem;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.subtitle-1 {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.7);
}
</style>
