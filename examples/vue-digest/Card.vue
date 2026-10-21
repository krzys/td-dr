<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section class="card">
    <h2 class="card-title">{{ title }}</h2>
    <div class="card-body"><slot /></div>
  </section>
</template>

<style scoped>
.card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1rem;
}
.card-title {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
</style>
