<script>
export const template = ["handlebars"];
</script>
<script setup>
import Row from "./Row.vue";
defineProps(["name"]);
</script>

<template>
  <div class="card">
    <Row :name="name" />
    <Row name="again" />
  </div>
</template>

<style>
.card { max-width: 600px; margin: 0 auto; }
</style>
