<template>
  <div>
    <h2 class="font-weight-bold">
      Who are we
    </h2>
    <div v-if="data.length">
      <ul>
        <li v-for="item in data" :key="item.name">{{ item.name }} - {{ item.company }}</li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import axios from 'axios';

interface DataResponse {
  items: Array<{ name: string; company: string }>;
}

interface MappedMemberData {
  name: string;
  company: string;
}

export default defineComponent({
  data() {
    return {
      data: [] as MappedMemberData[]
    };
  },
  methods: {
    async fetchData() {
      const memberTableUrl = 'https://coda.io/apis/v1/docs/QGamW4-aCG/tables/grid-jIgM45_t5e/rows';
      const config = {
        headers: {
          Authorization: `Bearer ${process.env.CODA_MEMBERS_TOKEN}`
        }
      };
      try {
        const response = await axios.get<DataResponse>(memberTableUrl,config);
        const codaData = response.data;
        const name = "c-mPywaDJJbO";
        const company = "c-LiFo-cAfN6";
        const mappedData = codaData.items.map((item: any) => {
          return {
            name: item.values[name],
            company: item.values[company]
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
