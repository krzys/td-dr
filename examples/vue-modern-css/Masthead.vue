<script setup>
defineProps({ issue: Number, date: String });
</script>

<template>
  <div class="masthead">
    <span class="brand">Fernhill Gardens</span>
    <span class="meta">Issue {{ issue }} · {{ date }}</span>
  </div>
</template>

<style scoped>
.masthead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: calc(var(--space) * 2);
  margin-bottom: calc(var(--space) * 3);
  border-bottom: 2px solid var(--leaf);

  .brand {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--leaf);
  }

  .meta {
    font: 0.8rem/1 Arial, sans-serif;
    color: var(--muted);
  }
}
</style>
