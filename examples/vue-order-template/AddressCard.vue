<script setup lang="ts">
import type { Address } from "./types.ts";

defineProps<{ title: string; address: Address }>();
</script>

<template>
  <div class="card">
    <h3>{{ title }}</h3>
    <p>
      {{ address.name }}<br />
      {{ address.line1 }}<br />
      <template v-if="address.line2">{{ address.line2 }}<br /></template>
      {{ address.city }} {{ address.postcode }}<br />
      {{ address.country }}
    </p>
  </div>
</template>

<style scoped>
.card {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1.1rem 1.25rem;
}
h3 { margin: 0 0 0.4rem; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
p { margin: 0; font-size: 0.85rem; line-height: 1.5; }
</style>
