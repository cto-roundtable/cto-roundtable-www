<template>
  <div style="background-color: #111;">
    <v-img
      src="coding-1.jpg"
      style="height: 100vh;"
      gradient="rgba(0, 0, 0, 0.4),rgba(0, 0, 0, 0.4)"
    >
      <IndexBody v-cloak />
    </v-img>
  </div>
</template>

<script setup>
  import IndexBody from './index-body';

  export default {
    components: {
      IndexBody,
    },
  };
</script>

<style scoped>
[v-cloak] {
  display: none;
}
</style>
