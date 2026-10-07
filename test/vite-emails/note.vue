<script setup>
defineProps({ title: String });
</script>

<template>
  <div class="note">
    <p class="text">{{ title }}</p>
  </div>
</template>

<style scoped>
.note { max-width: 600px; margin: 0 auto; padding: 12px; background: #fef3c7; }
.text { color: #92400e; }
</style>
