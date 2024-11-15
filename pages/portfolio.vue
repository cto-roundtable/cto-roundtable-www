<template>
    <v-container fluid class="text-center">
      <v-row justify="center" class="full-height">
        <v-col class="top-spacing" cols="12" md="8">
          <h2 class="font-weight-bold">
            Our portfolio
          </h2>
          <div v-if="data.length">
            <ul>
              <li v-for="item in data" :key="item.name">{{ item.company }} - {{ item.link }} - {{ item.investor }} </li>
            </ul>
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
          Authorization: `Bearer ${process.env.CODA_PORTFOLIO_COMPANIES}`
        }
      };
      try {
        const response = await axios.get(memberTableUrl,config);
        const codaData = response.data;
        const link = "c-3iXTxDH3zG";
        const investor = "c-wXm5l004Nc";
        const company = "c-MwD-eRXsBE";
        console.log(codaData);
        const mappedData = codaData.items.map((item: any) => {
          return {
            link: item.values[link],
            company: item.values[company],
            investor: item.values[investor]
          };
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
/* Add your styles here */
</style>
