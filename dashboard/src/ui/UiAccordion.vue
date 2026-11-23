<script setup lang="ts">
import { Accordion } from '@ui-sdk/vue/accordion'
defineProps<{ multiple?: boolean }>()
</script>
<template>
  <Accordion class="pi-accordion" :multiple="multiple"><slot /></Accordion>
</template>
