<script lang="ts">
// written as a normal SFC; the ESP fills it, the data sets here only preview it
export const template = ["handlebars", "liquid"];
export const lang = "en";
</script>

<script setup lang="ts">
import OrderItem from "./OrderItem.vue";
import OrderTotals from "./OrderTotals.vue";
import AddressCard from "./AddressCard.vue";
import StoreFooter from "./StoreFooter.vue";
import type { Address, Item, Totals } from "./types.ts";

defineProps<{
  customer: { firstName: string };
  order: {
    number: string;
    placedOn: string;
    url: string;
    delivery: { method: "standard" | "express" | "pickup"; free: boolean; eta?: string; store?: Address };
    taxExempt: boolean;
    taxExemptId?: string;
    subscription: { plan: string; interval: string; nextDate: string } | null;
    billingSameAsShipping: boolean;
    items: Item[];
    shipping: Address;
    billing?: Address;
    totals: Totals;
  };
  store: { code: string; helpUrl: string; unsubscribeUrl: string };
}>();
</script>

<template>
  <div class="page">
    <div class="masthead">
      <span class="logo">Oakline<span class="logo-dot">.</span></span>
      <span class="order-no">Order {{ order.number }}</span>
    </div>

    <div class="sheet">
      <p class="kicker">Order confirmed · {{ order.placedOn }}</p>
      <h1>Hi {{ customer.firstName }}, thank you.</h1>
      <p v-if="order.delivery.method === 'pickup'" class="lead">
        Your order is being picked at {{ order.delivery.store.name }}. We'll text you when it's ready to collect.
      </p>
      <p v-else-if="order.delivery.method === 'express'" class="lead">
        Express delivery: it should arrive {{ order.delivery.eta }}.
      </p>
      <p v-else class="lead">We're packing it now and will send tracking as soon as it ships.</p>

      <div v-if="order.subscription" class="subscription">
        <span class="badge">Repeat order</span>
        <p>
          You're on the <strong>{{ order.subscription.plan }}</strong> plan, delivered every
          {{ order.subscription.interval }}. The next one ships {{ order.subscription.nextDate }}.
        </p>
      </div>

      <h2 class="section">In this order</h2>
      <OrderItem v-for="item in order.items" :key="item.sku" :item="item" />

      <OrderTotals :totals="order.totals" :delivery="order.delivery" :tax-exempt="order.taxExempt" :tax-exempt-id="order.taxExemptId" />

      <div class="button-row">
        <a class="button" :href="order.url">Manage your order</a>
      </div>
    </div>

    <div class="addresses">
      <div class="column">
        <AddressCard v-if="order.delivery.method === 'pickup'" title="Pickup store" :address="order.delivery.store" />
        <AddressCard v-else title="Delivering to" :address="order.shipping" />
      </div>
      <div class="column">
        <div v-if="order.billingSameAsShipping" class="same">
          <h3>Billing</h3>
          <p>Same as the delivery address.</p>
        </div>
        <AddressCard v-else title="Billing" :address="order.billing" />
      </div>
    </div>

    <StoreFooter :store="store" />
  </div>
</template>

<style scoped>
.page { max-width: 600px; margin: 0 auto; padding: 1.5rem 1rem 2.5rem; }
.masthead {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.25rem 1.25rem;
}
.logo { font-size: 1.6rem; font-weight: 700; color: var(--ink); }
.logo-dot { color: var(--accent); }
.order-no { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.sheet { background: #ffffff; border-radius: 0.75rem; padding: 2rem 1.75rem 1.75rem; }
.kicker { margin: 0; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0.5rem 0 0; font-size: 1.75rem; line-height: 1.2; }
.lead { margin: 0.75rem 0 1.5rem; font-size: 0.95rem; line-height: 1.55; color: var(--muted); }
.subscription {
  background: var(--tint);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}
.subscription p { margin: 0.5rem 0 0; font-size: 0.875rem; line-height: 1.5; }
.badge {
  display: inline-block;
  background: var(--accent);
  color: #ffffff;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.section {
  margin: 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--ink);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.button-row { margin-top: 1.75rem; text-align: center; }
.button {
  display: inline-block;
  width: 220px;
  background: var(--ink);
  color: #ffffff;
  border-radius: 0.375rem;
  padding: 0.85rem 0;
  font-weight: 700;
  text-align: center;
  text-decoration: none;
}
.addresses { display: flex; flex-direction: row; gap: 1rem; margin-top: 1rem; }
.column { flex: 1; }
.same {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1.1rem 1.25rem;
}
.same h3 { margin: 0 0 0.4rem; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.same p { margin: 0; font-size: 0.85rem; line-height: 1.5; }
</style>

<style>
:root {
  --ink: #1f2937;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #c2410c;
  --tint: #fff7ed;
}
body { margin: 0; background: #f4f1ec; font-family: Helvetica, Arial, sans-serif; color: var(--ink); }
</style>
