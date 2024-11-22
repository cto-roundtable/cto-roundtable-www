<template>
  <div class="who-are-we">
    <h2 class="font-weight-bold">
      Who are we
    </h2>
    <div v-if="data.length">
      <!-- Current Members -->
      <ul class="current-members">
        <li v-for="item in currentMembers" :key="item.name" class="member-item">
          <span class="name">{{ item.name }}</span>
          <span class="company"> - {{ !item.company ? "Ex CTO: " : ""}}</span>
          <span v-if="item.company" class="company">
            <a :href="item.url" target="_blank">
              {{ item.company }}
            </a>
          </span>

          <span v-else class="company">
            <span v-for="(company, index) in item.formerCompanies" :key="index">
              <a :href="item.url.split(',')[index]" target="_blank">
                {{ company.trim() }}
              </a>
              <span v-if="index < item.formerCompanies.length - 1">, </span>
            </span>
          </span>
        </li>
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
      data: [] as MappedMemberData[],
    };
  },
  computed: {
    currentMembers(): MappedMemberData[] {
      const data = this.data.map((member) => {
        return {
          onlyFormerCTO: !member.company,
          ...member,
        }
      });
      console.log(data);
      return data
    }
  },
  methods: {
    async fetchData() {
      const memberTableUrl =
        'https://coda.io/apis/v1/docs/QGamW4-aCG/tables/grid-jIgM45_t5e/rows';
      const config = {
        headers: {
          Authorization: `Bearer ${process.env.membersToken}`,
        },
        params: {
          valueFormat: 'simpleWithArrays',
        }
      };
      try {
        const response = await axios.get<DataResponse>(memberTableUrl, config);
        const codaData = response.data;

        const name = 'c-mPywaDJJbO';
        const company = 'c-LiFo-cAfN6';
        const url = 'c-SMgaGzKRDr';
        const formerCompanies = 'c-u8jiOuOzw-'
        const mappedData = codaData.items
          .map((item: any) => ({
            name: item.values[name],
            company: item.values[company][0], // Empty string if no company
            formerCompanies: item.values[formerCompanies],
            url: item.values[url], // Empty string if no URL
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        this.data = mappedData;
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    },
  },
  created() {
    this.fetchData();
  },
});
</script>

<style scoped>
.who-are-we {
  background-color: #111; /* Match the background color of the rest of the page */
  color: #fff; /* Ensure text color is white */
  padding: 1rem; /* Add some padding */
  font-family: 'Arial', sans-serif;
}

.current-members,
.former-ctos ul {
  list-style: none;
  padding: 0;
}

.member-item {
  margin: 0.5rem 0;
  font-size: 1rem;
  line-height: 1.5;
}

.name {
  font-weight: bold;
  display: inline-block;
}

.company {
  font-style: italic;
  color: #bbb;
}

.subheading {
  margin-top: 2rem;
  font-size: 1.25rem;
  color: #f5f5f5;
  border-bottom: 1px solid #444;
  padding-bottom: 0.5rem;
}

.company a {
  font-style: italic;
  color: #bbb;
  text-decoration: underline;
}
</style>
