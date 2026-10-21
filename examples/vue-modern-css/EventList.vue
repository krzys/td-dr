<script setup>
defineProps({ events: Array });
</script>

<template>
  <div class="events">
    <h3>Coming up</h3>
    <div v-for="e in events" :key="e.title" class="event">
      <div class="date">
        <span class="day">{{ e.day }}</span>
        <span class="month">{{ e.month }}</span>
      </div>
      <div>
        <p class="what">{{ e.title }}</p>
        <p class="where">{{ e.place }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@layer base {
  .events {
    h3 {
      margin: 0 0 calc(var(--space) * 2);
      font-size: 1.1rem;
    }

    .event {
      display: flex;
      align-items: center;
      gap: calc(var(--space) * 2);
      padding-block: calc(var(--space) * 1.5);
      border-top: 1px solid color-mix(in oklch, var(--ink) 12%, transparent);

      & p {
        margin: 0;
      }
    }

    .date {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: calc(var(--space) * 7);
      padding-block: var(--space);
      border-radius: calc(var(--radius) / 1.5);
      background: var(--leaf);
      color: white;
      font-family: Arial, sans-serif;

      .day { font-size: 1.25rem; font-weight: 700; line-height: 1; }
      .month { font-size: 0.7rem; text-transform: uppercase; }
    }

    .where {
      font-size: 0.875rem;
      color: var(--muted);
    }
  }
}
</style>
