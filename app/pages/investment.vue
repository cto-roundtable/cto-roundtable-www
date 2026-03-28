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
        <div v-if="portfolioData.length">
          <v-container>
            <v-row>
              <v-col
                v-for="(item, index) in portfolioData"
                :key="index"
                cols="6"
                sm="4"
                md="2"
                class="d-flex justify-center"
              >
                <div v-if="loading" class="skeleton-loader" />
                <div v-else class="text-center">
                  <a
                    :href="item.link"
                    target="_blank"
                    class="company-link"
                    style="color: white;"
                  >
                    {{ item.company }}
                  </a>
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
const config = useRuntimeConfig()
const portfolioData = ref<any[]>([])
const loading = ref(true)

async function fetchData() {
  const tableUrl = 'https://coda.io/apis/v1/docs/fhpDktia_b/tables/table-G3AtyhOQl-/rows'
  try {
    const response = await $fetch<{ items: any[] }>(tableUrl, {
      headers: {
        Authorization: `Bearer ${config.public.portfolioToken}`,
      },
    })

    const linkKey = 'c-3iXTxDH3zG'
    const companyKey = 'c-MwD-eRXsBE'
    const investorKey = 'c-wXm5l004Nc'
    const mappedData = response.items
      .map((item: any) => ({
        created: item.createdAt,
        link: item.values[linkKey],
        company: item.values[companyKey],
        investor: item.values[investorKey],
      }))
      .sort((a: any, b: any) => new Date(a.created).getTime() - new Date(b.created).getTime())

    portfolioData.value = mappedData
  } catch (error) {
    console.error('Error fetching data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
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
