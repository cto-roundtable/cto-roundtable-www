<template>
  <v-app>
    <v-main>
      <div class="landing-page d-flex flex-column align-center justify-center" style="min-height: 100vh;">
        <h1 v-if="error?.statusCode === 404">
          Page not found
        </h1>
        <h1 v-else>
          An error occurred
        </h1>
        <v-btn class="mt-4" to="/" style="background-color: white;">
          Home page
        </v-btn>
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
const props = defineProps<{
  error: { statusCode: number; message: string }
}>()

useHead({
  title: props.error?.statusCode === 404 ? '404 Not Found' : 'An error occurred',
})
</script>

<style scoped>
.landing-page {
  background-color: #111;
  color: #fff;
}
</style>
