<script setup lang="ts">
import { computed } from "vue";
interface Task { id: number; title: string; status: string; owner: string; points: number }
const props = defineProps<{ status: string; tasks: Task[] }>();
const rows = computed(() =>
  props.tasks.filter((t) => t.status === props.status).sort((a, b) => b.points - a.points),
);
const total = computed(() => rows.value.reduce((n, t) => n + t.points, 0));
</script>

<template>
  <div class="group">
    <div class="group-head">
      <h3 :class="['status', status]">{{ status.replace("-", " ") }}</h3>
      <span class="total">{{ total }} pts</span>
    </div>
    <ul v-if="rows.length" class="list">
      <li v-for="t in rows" :key="t.id" class="row">
        <span class="name">{{ t.title }}</span>
        <span class="owner">{{ t.owner }}</span>
        <span class="pts">{{ t.points }}</span>
      </li>
    </ul>
    <p v-else class="empty">Nothing here this week.</p>
  </div>
</template>

<style scoped>
.group { margin-bottom: 1rem; }
.group-head { display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.status { margin: 0; font-size: 0.8rem; text-transform: capitalize; letter-spacing: 0.04em; }
.done { color: #15803d; }
.in-progress { color: #b45309; }
.blocked { color: #b91c1c; }
.total { font-size: 0.75rem; color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; }
.row {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--line);
  font-size: 0.875rem;
}
.name { color: var(--ink); }
.owner { color: var(--muted); }
.pts { font-weight: 700; color: var(--ink); }
.empty { margin: 0; font-size: 0.875rem; font-style: italic; color: var(--muted); }
</style>
