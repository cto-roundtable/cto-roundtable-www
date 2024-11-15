<template>
    <v-container fluid class="text-center">
      <v-row justify="center" class="full-height">
        <v-col class="top-spacing" cols="12" md="8">
          <v-img
            src="ctoroundtablelogo.svg"
            alt="CTO Network Logo"
            class="mb-9"
            contain
          />
          <p class="mt-3" style="font-size: 1.5rem;">
            Empowering technology leaders through network, community and investing
          </p>
          <v-btn
            color="secondary"
            large
            class="mt-6"
            to="/portfolio"
          >
            Portfolio
          </v-btn>

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
