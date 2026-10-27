<template>
  <div class="mx-auto flex max-w-xl flex-col gap-3 px-4 py-16">
    <h1 class="display-condensed text-3xl">This page doesn't exist</h1>
    <p class="text-ink-2">
      The link may be mistyped. Search for a movie or go back to the home page.
    </p>
    <RouterLink :to="{ name: 'home' }" class="font-semibold underline underline-offset-4"
      >Go to the home page</RouterLink
    >
  </div>
</template>
