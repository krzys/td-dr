<script>
export const lang = "en";
</script>

<script setup>
import Masthead from "./Masthead.vue";
import StoryCard from "./StoryCard.vue";
import EventList from "./EventList.vue";
import SignOff from "./SignOff.vue";

defineProps(["issue", "date", "lead", "stories", "events", "unsubscribeUrl"]);
</script>

<template>
  <div class="letter">
    <Masthead :issue="issue" :date="date" />
    <StoryCard v-bind="lead" featured />
    <div class="grid">
      <StoryCard v-for="s in stories" :key="s.id" v-bind="s" />
    </div>
    <EventList :events="events" />
    <SignOff :unsubscribe-url="unsubscribeUrl" />
  </div>
</template>

<style>
@layer tokens, base;

@layer tokens {
  :root {
    --space: 0.5rem;
    --radius: 0.75rem;
    --ink: oklch(0.25 0.03 150);
    --leaf: oklch(0.55 0.13 150);
    --paper: oklch(0.98 0.01 100);
    --muted: color-mix(in oklch, var(--ink) 60%, white);
  }
}

@layer base {
  body {
    margin: 0;
    background: color-mix(in oklch, var(--leaf) 8%, var(--paper));
    color: var(--ink);
    font: 1rem/1.5 Georgia, "Times New Roman", serif;
  }
}
</style>

<style scoped>
.letter {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(var(--space) * 3) calc(var(--space) * 2);

  & .grid {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space) * 2);
    margin-block: calc(var(--space) * 3);
  }
}
</style>
