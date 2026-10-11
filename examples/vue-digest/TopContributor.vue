<script setup>
import Avatar from "./Avatar.vue";
defineProps({
  name: { type: String, required: true },
  role: String,
  merged: Number,
  quote: String,
});
</script>

<template>
  <div class="top">
    <Avatar :name="name" />
    <div class="info">
      <strong class="who">{{ name }}</strong>
      <span class="role">{{ role }} · {{ merged }} PRs merged</span>
      <p v-if="quote" class="quote">“{{ quote }}”</p>
    </div>
  </div>
</template>

<style scoped>
.top { display: flex; flex-direction: row; gap: 1rem; align-items: flex-start; }
.info { display: flex; flex-direction: column; gap: 0.2rem; }
.who { font-size: 1rem; color: var(--ink); }
.role { font-size: 0.8rem; color: var(--muted); }
.quote { margin: 0.4rem 0 0; font-size: 0.875rem; font-style: italic; color: var(--ink); }
</style>
