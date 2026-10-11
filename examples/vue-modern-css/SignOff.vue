<script setup>
defineProps({ unsubscribeUrl: String });
</script>

<template>
  <div class="signoff">
    <p>Happy growing,<br />The Fernhill team</p>
    <p class="small">
      You get this because you joined the Fernhill mailing list.
      <a :href="unsubscribeUrl">Unsubscribe</a>
    </p>
  </div>
</template>

<style scoped>
.signoff {
  margin-top: calc(var(--space) * 4);
  text-align: center;

  .small {
    font: 0.75rem/1.5 Arial, sans-serif;
    color: var(--muted);

    & a { color: inherit; }
  }
}
</style>
