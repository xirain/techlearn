import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDatetime: z.date(),
    tags: z.array(z.string()).default(["others"]),
    draft: z.boolean().optional(),
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
  }),
});

export const collections = { posts };
