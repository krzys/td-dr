<script setup lang="ts">
import type { Item } from "./types.ts";

defineProps<{ item: Item }>();
</script>

<template>
  <div class="item">
    <img :src="item.image" :alt="item.name" width="72" height="72" />
    <div class="text">
      <p class="name">{{ item.name }}</p>
      <p class="variant">{{ item.variant }} · Qty {{ item.qty }}</p>
      <p v-if="item.discount" class="deal">{{ item.discount.label }}</p>
    </div>
    <div class="price">
      <template v-if="item.discount">
        <s>{{ item.listPrice }}</s><br />
      </template>
      <strong>{{ item.price }}</strong>
    </div>
  </div>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}
.item img { display: block; border-radius: 0.375rem; }
.text { flex: 1; }
.name { margin: 0; font-size: 0.95rem; font-weight: 700; }
.variant { margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--muted); }
.deal { margin: 0.25rem 0 0; font-size: 0.8rem; font-weight: 700; color: var(--accent); }
.price { font-size: 0.9rem; text-align: right; }
.price s { color: var(--muted); }
</style>
