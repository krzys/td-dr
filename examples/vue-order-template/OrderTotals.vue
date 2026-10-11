<script setup lang="ts">
import type { Totals } from "./types.ts";

defineProps<{ totals: Totals; delivery: { method: string; free: boolean }; taxExempt: boolean; taxExemptId?: string }>();
</script>

<template>
  <div class="totals">
    <div class="row">
      <span>Subtotal</span>
      <span>{{ totals.subtotal }}</span>
    </div>
    <div v-if="totals.savings" class="row saving">
      <span>Savings</span>
      <span>-{{ totals.savings }}</span>
    </div>
    <div class="row">
      <span>Delivery</span>
      <span>
        <template v-if="delivery.method === 'pickup'">Free pickup</template>
        <template v-else-if="delivery.free">Free</template>
        <template v-else>{{ totals.delivery }}</template>
      </span>
    </div>
    <div v-if="taxExempt" class="row">
      <span>Sales tax</span>
      <span>Exempt</span>
    </div>
    <div v-else class="row">
      <span>Sales tax</span>
      <span>{{ totals.tax }}</span>
    </div>
    <div class="row total">
      <span>Total</span>
      <span>{{ totals.total }}</span>
    </div>
    <p v-if="taxExempt" class="exempt">Tax-exempt certificate {{ taxExemptId }} is on file for this account.</p>
  </div>
</template>

<style scoped>
.totals { padding-top: 1rem; font-size: 0.9rem; }
.row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 0.3rem 0;
  color: var(--muted);
}
.saving { color: var(--accent); }
.exempt { margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--muted); }
.total {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 2px solid var(--ink);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
}
</style>
