<template>
  <div class="landing-page">
    <v-container fluid class="text-center">
      <v-row justify="center" class="full-height">
        <v-col class="top-spacing" cols="12" md="8">
          <v-img
            src="ctoroundtablelogo.svg"
            alt="CTO Network Logo"
            class="mb-9"
            contain
          />
          <p class="subtitle-1 mt-3">
            Empowering technology leaders through network, community and investing
          </p>
          <v-btn
            color="primary"
            large
            href="mailto:post@ctoroundtable.no"
            class="mt-6"
          >
            Contact Us
          </v-btn>

          <whoAreWe />

        </v-col>
      </v-row>
    </v-container>
  </div>
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
.landing-page {
  background-color: #111;
  color: #fff;
  height: 100vh; /* Ensures full viewport height */
}

.top-spacing {
  margin-top: 5rem;
}
</style>
