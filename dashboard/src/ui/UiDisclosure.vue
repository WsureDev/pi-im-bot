<script setup lang="ts">
import { useId } from 'vue'
import { AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel } from '@ui-sdk/vue/accordion'
defineProps<{ title: string }>()
const id = useId()
</script>
<template>
  <AccordionItem :value="id"
    ><AccordionHeader
      ><AccordionTrigger class="pi-disclosure"
        >{{ title }}<span aria-hidden="true">⌄</span></AccordionTrigger
      ></AccordionHeader
    >
    <AccordionPanel class="pi-section"><slot /></AccordionPanel
  ></AccordionItem>
</template>
