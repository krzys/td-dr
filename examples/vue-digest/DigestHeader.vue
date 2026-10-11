<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ team: string; weekStart: string; weekEnd: string }>();
const range = computed(() => `${props.weekStart} – ${props.weekEnd}`);
const logo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="10" fill="#4f46e5"/><path d="M12 30l8-10 6 7 4-5 6 8z" fill="#fff"/></svg>',
  );
</script>

<template>
  <header class="head">
    <img class="logo" :src="logo" width="48" height="48" alt="" />
    <div class="titles">
      <p class="eyebrow">Weekly team digest</p>
      <h1>{{ team }}</h1>
      <p class="range">{{ range }}</p>
    </div>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  align-items: center;
  padding: 1.5rem 0 1.25rem;
}
.logo { border-radius: 0.6rem; }
.titles { display: flex; flex-direction: column; gap: 0.15rem; }
.eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 { margin: 0; font-size: 1.6rem; line-height: 1.2; color: var(--ink); }
.range { margin: 0; font-size: 0.875rem; color: var(--muted); }
</style>
