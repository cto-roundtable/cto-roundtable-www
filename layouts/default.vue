  <template>
    <v-app>
      <v-main>
        <div class="landing-page">
          <v-btn icon class="home-icon" to="/">
            <v-icon style="color: white;">mdi-home</v-icon>
          </v-btn>
          <Nuxt />
        </div>
      </v-main>
    </v-app>
  </template>


<style>
.landing-page {
  background-color: #111;
  color: #fff;
  height: 100%; /* Ensures full viewport height */
}

.home-icon {
  position: absolute;
  top: 16px;
  left: 16px;
  color: white;
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
  font-size: 29px;
  margin-bottom: 1rem;
}

.subtitle-1 {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.7);
}
</style>
