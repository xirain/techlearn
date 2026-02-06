import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const posts = await getCollection("posts", ({ data }) => !data.draft);

  const searchData = posts.map((post) => ({
    title: post.data.title,
    description: post.data.description,
    tags: post.data.tags,
    slug: post.slug,
  }));

  return new Response(JSON.stringify(searchData), {
    headers: { "Content-Type": "application/json" },
  });
};
