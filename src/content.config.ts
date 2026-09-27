import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      // Orrery deep link (orrery/ROADMAP.md P0.8): the id of the playground
      // "planet" (see orrery/src/registry.ts's `playgrounds` array) that
      // showcases this page's library, e.g. `planet: signals` for css-signals.
      // Rendered as a "Try it live in ORRERY" card by the PageTitle override
      // in src/components/PageTitle.astro whenever this is set.
      extend: z.object({ planet: z.string().optional() }),
    }),
  }),
};
