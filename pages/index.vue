<template>
    <v-container fluid class="text-center">
      <v-row justify="center" class="full-height">
        <v-col class="top-spacing" cols="12" md="8">
          <nuxt-img 
            src="ctoroundtablelogo.svg" 
            alt="CTO Network Logo"
            placeholder
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
            large
            class="mt-6"
            to="/investment"
            style="margin-right: 15px; background-color: black; border: 1px solid white; color: white"
          >
            Investments
          </v-btn>

          <v-btn
            large
            href="mailto:post@ctoroundtable.no"
            class="mt-6"
            style="background-color: white;"
          >
            Contact Us
          </v-btn>

          <whoAreWe />

        </v-col>
      </v-row>
    </v-container>
</template>

<script lang="ts">
import whoAreWe from "~/pages/whoarewe.vue";
export default {
  name: "LandingPage",
  components: {
    whoAreWe,
  },
};
</script>

<style scoped>
.top-spacing {
  margin-top: 5rem;
}
</style>
