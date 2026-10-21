<script setup>
defineProps({ kicker: String, tag: String, title: String, body: String, blurb: String, href: String, featured: Boolean });
</script>

<template>
  <div class="card" :class="{ featured }">
    <span class="tag">{{ kicker || tag }}</span>
    <h2 class="title">{{ title }}</h2>
    <p class="text">{{ body || blurb }}</p>
    <a class="more" :href="href">{{ featured ? "Read the full story" : "Read more" }} →</a>
  </div>
</template>

<style scoped>
.card {
  --card-bg: white;
  background: var(--card-bg);
  border: 1px solid color-mix(in oklch, var(--leaf) 25%, transparent);
  border-radius: var(--radius);
  padding: calc(var(--space) * 2.5);

  & .tag {
    display: inline-block;
    padding: calc(var(--space) / 2) var(--space);
    border-radius: 999px;
    background: color-mix(in oklch, var(--leaf) 15%, white);
    color: oklch(0.4 0.1 150);
    font: 700 0.7rem/1 Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  & .title {
    margin: calc(var(--space) * 1.5) 0 var(--space);
    font-size: 1.25rem;
    line-height: 1.3;
  }

  & .text {
    margin: 0 0 calc(var(--space) * 2);
    color: var(--muted);
  }

  & .more {
    color: var(--leaf);
    font-weight: 700;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  &.featured {
    --card-bg: oklch(0.95 0.04 150);
    border-color: transparent;

    & .title {
      font-size: 1.75rem;
    }
  }
}
</style>
