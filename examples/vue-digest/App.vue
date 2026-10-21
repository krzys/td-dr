<script lang="ts">
export const lang = "en";
</script>

<script setup lang="ts">
import Card from "./Card.vue";
import DigestHeader from "./DigestHeader.vue";
import StatTile from "./StatTile.vue";
import TaskGroup from "./TaskGroup.vue";
import Avatar from "./Avatar.vue";
import TopContributor from "./TopContributor.vue";
import DigestFooter from "./DigestFooter.vue";

defineProps<{
  team: string;
  weekStart: string;
  weekEnd: string;
  kpis: { label: string; value: number; delta: number; lowerIsBetter?: boolean }[];
  tasks: { id: number; title: string; status: string; owner: string; points: number }[];
  members: string[];
  top: { name: string; role: string; merged: number; quote: string };
}>();
const statuses = ["done", "in-progress", "blocked", "review"];
</script>

<template>
  <div class="digest">
    <DigestHeader :team="team" :week-start="weekStart" :week-end="weekEnd" />
    <div class="kpis">
      <StatTile v-for="k in kpis" :key="k.label" v-bind="k" />
    </div>
    <Card title="Tasks this week">
      <TaskGroup v-for="s in statuses" :key="s" :status="s" :tasks="tasks" />
    </Card>
    <Card title="Who was around">
      <div class="people">
        <Avatar v-for="m in members" :key="m" :name="m" />
      </div>
    </Card>
    <Card title="Top contributor">
      <TopContributor v-bind="top" />
    </Card>
    <DigestFooter :team="team" />
  </div>
</template>

<style scoped>
.digest { max-width: 600px; margin: 0 auto; padding: 0 1rem; }
.kpis { display: flex; flex-direction: row; gap: 0.75rem; margin-bottom: 1rem; }
.people { display: flex; flex-direction: row; gap: 0.5rem; }
</style>

<style>
:root {
  --ink: #111827;
  --muted: #6b7280;
  --line: #e5e7eb;
  --tile: #f9fafb;
  --accent: #4f46e5;
}
body { margin: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; color: var(--ink); }
</style>
