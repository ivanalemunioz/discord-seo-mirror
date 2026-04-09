import { defineCollection, z } from 'astro:content';

const discussions = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    channelId: z.string(),
    channelName: z.string(),
    threadId: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    messageCount: z.number().default(0),
    author: z.string().optional(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    excerpt: z.string().default('')
  })
});

export const collections = { discussions };
