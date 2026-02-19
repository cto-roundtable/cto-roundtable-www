<template>
  <v-container fluid class="text-center">
    <v-row justify="center" class="full-height">
      <v-col class="top-spacing" cols="12" md="8">
        <NuxtImg
          src="/ctoroundtablelogo.svg"
          alt="CTO Network Logo"
          width="300"
          height="180"
          class="logo"
          fit="contain"
          preload
          loading="lazy"
        />
        <p class="mt-3" style="font-size: 18px; max-width: 1000px; margin: 0 auto;">
          A Norwegian community of CTOs focused on sharing knowledge and supporting each other. We also invest in and guide early-stage tech companies and exceptional technical leaders to help them succeed
        </p>
        <v-btn
          size="large"
          class="mt-6"
          to="/investment"
          style="margin-right: 15px; background-color: black; border: 1px solid white; color: white"
        >
          Investments
        </v-btn>

        <v-btn
          size="large"
          href="mailto:post@ctoroundtable.no"
          class="mt-6"
          style="background-color: white;"
        >
          Contact Us
        </v-btn>

        <WhoAreWe />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
</script>

<style scoped>
.top-spacing {
  margin-top: 5rem;
}
</style>
