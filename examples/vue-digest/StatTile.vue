<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ label: string; value: number; delta: number; lowerIsBetter?: boolean }>();
const good = computed(() => (props.lowerIsBetter ? props.delta < 0 : props.delta > 0));
const arrow = computed(() => (props.delta > 0 ? "▲" : props.delta < 0 ? "▼" : "•"));
const deltaText = computed(() => `${arrow.value} ${Math.abs(props.delta)}`);
</script>

<template>
  <div class="tile">
    <span class="value">{{ value }}</span>
    <span class="label">{{ label }}</span>
    <span class="delta" :class="good ? 'up' : 'down'" :style="{ fontWeight: 600 }">{{ deltaText }}</span>
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  background: var(--tile);
  border-radius: 0.5rem;
  border: 1px solid var(--line);
}
.value { font-size: 1.5rem; font-weight: 700; color: var(--ink); }
.label { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.delta { font-size: 0.8rem; }
.up { color: #15803d; }
.down { color: #b91c1c; }
</style>
