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
          <div v-if="data.length">
            <v-container>
              <v-row>
                <v-col
                  v-for="(data, index) in data"
                  :key="index"
                  cols="6"
                  sm="4"
                  md="2"
                  class="d-flex justify-center"
                >
                  <div v-if="loading" class="skeleton-loader"></div>
                  <div class="text-center">
                    <a
                      :href="data.link"
                      target="_blank"
                      class="company-link"
                      style="color: white;"
                    >
                      {{ data.company }}
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

<script lang="ts">
import { defineComponent } from 'vue';
import axios from 'axios';

export default defineComponent({
  name: 'AboutPage',
  data() {
    return {
      data: Array.from({ length: 11 }, (_, index) => index + 1),
      loading: true
    };
  },
  methods: {
    async fetchData() {
      const memberTableUrl = 'https://coda.io/apis/v1/docs/fhpDktia_b/tables/table-G3AtyhOQl-/rows';
      const config = {
        headers: {
          Authorization: `Bearer ${process.env.portfolioToken}`
        }
      };
      try {
        const response = await axios.get(memberTableUrl,config);
        const codaData = response.data;
        const link = "c-3iXTxDH3zG";
        const investor = "c-wXm5l004Nc";
        const company = "c-MwD-eRXsBE";
        const mappedData = codaData.items.map((item: any) => {
          return {
            created: item.createdAt,
            link: item.values[link],
            company: item.values[company],
            investor: item.values[investor]
          };
        });
        const sortData = mappedData.sort((a:any, b:any) => {
          return  new Date(a.created).getTime() - new Date(b.created).getTime()
        });
        this.data = mappedData;
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        this.loading = false;
      }
    }
  },
  created() {
    this.fetchData();
  }
});
</script>

<style scoped>
.transparent-list {
  background-color: transparent;
}

/* Skeleton loader styles */
.skeleton-loader {
  width: 100%;
  height: 15px; /* Adjust the height as needed */
  background-color: #313030;
  margin: 10px 0;
  border-radius: 4px;
  animation: pulse 0.9s infinite ease-in-out;
}

/* Pulse animation */
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
