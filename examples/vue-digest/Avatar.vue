<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: string }>();
const initials = computed(() =>
  props.name.split(/\s+/).map((p) => p[0]!.toUpperCase()).slice(0, 2).join(""),
);
const hue = computed(() => [...props.name].reduce((n, c) => n + c.charCodeAt(0), 0) % 360);
</script>

<template>
  <span class="avatar" :style="{ backgroundColor: `hsl(${hue}, 55%, 45%)` }" :title="name">{{ initials }}</span>
</template>

<style scoped>
.avatar {
  display: block;
  width: 2.5rem;
  height: 2.5rem;
  line-height: 2.5rem;
  border-radius: 50%;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  color: #ffffff;
}
</style>
