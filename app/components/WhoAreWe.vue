<template>
  <div class="who-are-we">
    <h2 class="font-weight-bold">
      Who we are
    </h2>
    <ul v-if="status === 'pending' && !data?.members?.length" class="current-members skeleton-list">
      <li v-for="i in 8" :key="i" class="member-item">
        <span class="skeleton" :style="{ width: 80 + Math.random() * 100 + 'px' }" />
        <span class="skeleton" :style="{ width: 60 + Math.random() * 80 + 'px', marginLeft: '8px' }" />
      </li>
    </ul>
    <div v-if="data?.members?.length">
      <span class="sort-hint" @click="showSort = true">{{ sortLabel }}</span>
      <ClientOnly>
        <v-dialog v-model="showSort" max-width="300">
          <v-card color="#222" class="pa-4">
            <v-card-title class="text-white text-body-1 pa-0 mb-3">Sort members by</v-card-title>
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
      <ul class="current-members">
        <li v-for="item in currentMembers" :key="item.name" class="member-item">
          <div class="name">{{ item.name }}</div>
          <div v-if="item.isMultiRole" class="positions">
            <div v-for="(pos, index) in item.currentPositions" :key="'c'+index" class="position-line">
              <span v-if="pos.roleTitle" class="role">{{ pos.roleTitle }}, </span>
              <a v-if="pos.url" :href="pos.url" target="_blank">{{ pos.org }}</a>
              <span v-else>{{ pos.org }}</span>
            </div>
            <div v-for="(pos, index) in item.formerPositions" :key="'f'+index" class="position-line former">
              <span class="former-label">Former: </span>
              <span v-if="pos.roleTitle">{{ pos.roleTitle }}, </span>
              <a v-if="pos.url" :href="pos.url" target="_blank" class="former-link">{{ pos.org }}</a>
              <span v-else class="former-link">{{ pos.org }}</span>
            </div>
          </div>
          <div v-else class="positions">
            <template v-if="item.currentPositions.length">
              <span v-if="item.currentPositions[0].roleTitle" class="role">{{ item.currentPositions[0].roleTitle }}, </span>
              <a v-if="item.currentPositions[0].url" :href="item.currentPositions[0].url" target="_blank">{{ item.currentPositions[0].org }}</a>
              <span v-else>{{ item.currentPositions[0].org }}</span>
            </template>
            <template v-else-if="item.formerPositions.length">
              <span class="former-label">Former: </span>
              <span v-for="(pos, index) in item.formerPositions" :key="'f'+index">
                <a v-if="pos.url" :href="pos.url" target="_blank" class="former-link">{{ pos.org }}</a>
                <span v-else class="former-link">{{ pos.org }}</span>
                <span v-if="index < item.formerPositions.length - 1">, </span>
              </span>
            </template>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Position {
  org: string
  url: string
  roleTitle: string | null
  isCurrent: boolean
}

interface MemberData {
  name: string
  company: string
  formerCompanies: string[]
  url: string
  positions?: Position[]
}

interface MembersResponse {
  sort: string
  members: MemberData[]
}

const sortOptions = [
  { key: 'name', label: 'Name' },
  { key: 'company', label: 'Company' },
  { key: 'joined', label: 'Joined' },
  { key: 'random', label: 'Shuffle' },
]

const activeSort = ref<string | null>(null)
const showSort = ref(false)

const { data, status, refresh } = await useFetch<MembersResponse>('/api/members', {
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

const currentMembers = computed(() => {
  return (data.value?.members || []).map((member) => {
    const current = (member.positions || []).filter((p) => p.isCurrent)
    const former = (member.positions || []).filter((p) => !p.isCurrent)
    const totalRoles = current.length + former.length
    return {
      ...member,
      currentPositions: current,
      formerPositions: former,
      isMultiRole: totalRoles > 1,
    }
  })
})
</script>

<style scoped>
.who-are-we {
  background-color: #111;
  color: #fff;
  padding: 1rem;
  font-family: 'Work Sans', Arial, sans-serif;
}

.current-members {
  list-style: none;
  padding: 0;
}

.member-item {
  margin: 0.6rem 0;
  text-align: center;
}

.name {
  font-weight: bold;
  font-size: 1rem;
}

.positions {
  font-size: 0.85rem;
  font-style: italic;
  color: #888;
  margin-top: 2px;
}

.positions a {
  color: #888;
  text-decoration: underline;
}

.role {
  color: #888;
}

.former-label {
  color: #555;
}

.former-link {
  color: #555;
}

a.former-link {
  text-decoration: underline;
}

.position-line {
  line-height: 1.4;
}

.position-line.former {
  color: #555;
}

.skeleton-list {
  list-style: none;
  padding: 0;
}

.skeleton {
  display: inline-block;
  height: 14px;
  background-color: #2a2a2a;
  border-radius: 4px;
  animation: pulse 1s infinite ease-in-out;
}

@keyframes pulse {
  0% { background-color: #2a2a2a; }
  50% { background-color: #3a3a3a; }
  100% { background-color: #2a2a2a; }
}

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
</style>
