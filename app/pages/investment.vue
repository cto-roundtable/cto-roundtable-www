<template>
  <v-container fluid class="text-center">
    <v-row justify="center" class="full-height">
      <v-col class="top-spacing" cols="12" md="8">
        <h2 class="font-weight-bold">
          How we invest
        </h2>
        <p class="mt-3" style="font-size: 18px;">
          We invest in early-stage tech companies with a clear vision and strong product teams
          <br />
          We enter with an angel size investment
        </p>
        <h2 class="font-weight-bold">
          Our portfolio
        </h2>
        <div v-if="pending" class="d-flex justify-center my-4">
          <v-row>
            <v-col v-for="n in 6" :key="n" cols="6" sm="4" md="2">
              <div class="skeleton-loader" />
            </v-col>
          </v-row>
        </div>
        <div v-else-if="data?.investments.length">
          <v-container>
            <v-row>
              <v-col
                v-for="(item, index) in data.investments"
                :key="index"
                cols="6"
                sm="4"
                md="2"
                class="d-flex justify-center"
              >
                <div class="text-center">
                  <a
                    v-if="item.url"
                    :href="item.url"
                    target="_blank"
                    class="company-link"
                    style="color: white;"
                  >
                    {{ item.company }}
                  </a>
                  <span v-else style="color: white;">{{ item.company }}</span>
                </div>
              </v-col>
            </v-row>
          </v-container>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
const { data, pending } = useFetch('/api/investments')
</script>

<style scoped>
.top-spacing {
  margin-top: 3rem;
}

.skeleton-loader {
  width: 100%;
  height: 15px;
  background-color: #313030;
  margin: 10px 0;
  border-radius: 4px;
  animation: pulse 0.9s infinite ease-in-out;
}

@keyframes pulse {
  0% {
    background-color: #313030;
  }
  50% {
    background-color: #494848;
  }
  100% {
    background-color: #343333;
  }
}
</style>
