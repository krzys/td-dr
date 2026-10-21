<script setup>
defineProps(["name"]);
</script>

<template>
  <p class="row">Hi {{ name }}</p>
</template>

<style>
.row { position: absolute; color: #333333; }
</style>
