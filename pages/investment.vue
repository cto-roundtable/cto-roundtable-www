<template>
    <v-container fluid class="text-center">
      <v-row justify="center" class="full-height">
        <v-col class="top-spacing" cols="12" md="8">
          <h2 class="font-weight-bold">
            How we invest
          </h2>
          <p class="mt-3" style="font-size: 18px;">
            We invest in technological advance companies that have a clear vision and a strong team on technology and product.
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
      data: []
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
</style>
