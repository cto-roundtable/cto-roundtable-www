<template>
  <v-app>
    <v-main>
      <div class="landing-page">
        <v-btn icon to="/" class="home-icon">
          <v-icon color="white">mdi-home</v-icon>
        </v-btn>
        <slot />
      </div>
    </v-main>
  </v-app>
</template>

<style>
.landing-page {
  background-color: #111;
  color: #fff;
  min-height: 100vh;
}

.home-icon {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
}

.full-height {
  min-height: 100vh;
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
