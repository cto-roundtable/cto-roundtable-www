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
        <span v-if="data?.investments.length" class="sort-hint" @click="showSort = true">{{ sortLabel }}</span>
        <ClientOnly>
          <v-dialog v-model="showSort" max-width="300">
            <v-card color="#222" class="pa-4">
              <v-card-title class="text-white text-body-1 pa-0 mb-3">Sort portfolio by</v-card-title>
              <v-btn
                v-for="opt in sortOptions"
                :key="opt.key"
                block
                variant="tonal"
                class="mb-2 text-white"
                @click="pickSort(opt.key)"
              >
                {{ opt.label }}
              </v-btn>
            </v-card>
          </v-dialog>
        </ClientOnly>
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
const sortOptions = [
  { key: 'name', label: 'Name' },
  { key: 'date', label: 'Date invested' },
]

const activeSort = ref<string | null>(null)
const showSort = ref(false)

const { data, pending, refresh } = useFetch('/api/investments', {
  query: computed(() => activeSort.value ? { sort: activeSort.value } : {}),
})

const sortLabel = computed(() => {
  const serverSort = data.value?.sort
  const opt = sortOptions.find((o) => o.key === serverSort)
  return opt ? `Sorted by ${opt.label.toLowerCase()}` : ''
})

function pickSort(key: string) {
  activeSort.value = key
  showSort.value = false
  refresh()
}
</script>

<style scoped>
.sort-hint {
  display: inline-block;
  font-size: 0.75rem;
  color: #555;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: color 0.2s;
}

.sort-hint:hover {
  color: #888;
}

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
