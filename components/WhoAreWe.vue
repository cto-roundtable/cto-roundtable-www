<template>
  <div class="who-are-we">
    <h2 class="font-weight-bold">
      Who we are
    </h2>
    <div v-if="data.length">
      <ul class="current-members">
        <li v-for="item in currentMembers" :key="item.name" class="member-item">
          <span class="name">{{ item.name }}</span>
          <span class="company"> - {{ !item.company ? "Ex CTO: " : "" }}</span>
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

<script setup lang="ts">
interface MappedMemberData {
  name: string
  company: string
  formerCompanies?: string[]
  url: string
}

const config = useRuntimeConfig()
const data = ref<MappedMemberData[]>([])

const currentMembers = computed(() => {
  return data.value.map((member) => ({
    onlyFormerCTO: !member.company,
    ...member,
  }))
})

async function fetchData() {
  const memberTableUrl = 'https://coda.io/apis/v1/docs/QGamW4-aCG/tables/grid-jIgM45_t5e/rows'
  try {
    const response = await $fetch<{ items: any[] }>(memberTableUrl, {
      headers: {
        Authorization: `Bearer ${config.public.membersToken}`,
      },
      params: {
        valueFormat: 'simpleWithArrays',
      },
    })

    const nameKey = 'c-mPywaDJJbO'
    const companyKey = 'c-LiFo-cAfN6'
    const urlKey = 'c-SMgaGzKRDr'
    const formerCompaniesKey = 'c-u8jiOuOzw-'
    const mappedData = response.items
      .map((item: any) => ({
        name: item.values[nameKey],
        company: item.values[companyKey][0],
        formerCompanies: item.values[formerCompaniesKey],
        url: item.values[urlKey],
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    data.value = mappedData
  } catch (error) {
    console.error('Error fetching data:', error)
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.who-are-we {
  background-color: #111;
  color: #fff;
  padding: 1rem;
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

.company a {
  font-style: italic;
  color: #bbb;
  text-decoration: underline;
}
</style>
