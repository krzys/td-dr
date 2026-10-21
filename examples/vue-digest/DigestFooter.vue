<template>
  <footer class="foot">
    <p>You get this because you are on <strong>{{ team }}</strong>.</p>
    <a class="link" href="https://example.com/digest/preferences">Manage preferences</a>
  </footer>
</template>

<script setup lang="ts">
defineProps<{ team: string }>();
</script>

<style scoped>
.foot { padding: 1rem 0 2rem; text-align: center; font-size: 0.75rem; color: var(--muted); }
.foot p { margin: 0 0 0.4rem; }
.link { color: var(--accent); text-decoration: underline; }
</style>
