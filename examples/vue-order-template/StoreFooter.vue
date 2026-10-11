<script setup lang="ts">
defineProps<{ store: { code: string; helpUrl: string; unsubscribeUrl: string } }>();
</script>

<template>
  <div class="footer">
    <p>Need a hand? <a :href="store.helpUrl">Visit the help centre</a> or reply to this email.</p>
    <p v-if="store.code === 'uk'">Oakline Home Ltd · 3 Tannery Lane, Bristol BS1 6QH · VAT GB 284 1190 32</p>
    <p v-else-if="store.code === 'eu'">Oakline Home GmbH · Torstraße 140, 10119 Berlin · USt-IdNr. DE 318 552 904</p>
    <p v-else>Oakline Home Inc. · 455 Bryant St, San Francisco, CA 94107</p>
    <p><a :href="store.unsubscribeUrl">Email preferences</a></p>
  </div>
</template>

<style scoped>
.footer { margin-top: 1.5rem; font-size: 0.75rem; line-height: 1.5; text-align: center; color: var(--muted); }
.footer p { margin: 0 0 0.5rem; }
.footer a { color: var(--muted); }
</style>
