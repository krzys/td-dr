<script>
export const template = ["handlebars"];
</script>
<script setup>
defineProps(["items"]);
</script>

<template>
  <div class="row">
    <p v-for="item in items" :key="item" class="cell">{{ item }}</p>
  </div>
</template>

<style>
.row { display: flex; max-width: 600px; }
.cell { flex: 1; }
</style>
