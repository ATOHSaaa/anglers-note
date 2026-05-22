import { defineCollection, z } from "astro:content";

const articles = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    author: z.string().default("ツリナラ編集部"),
    mainKeyword: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
