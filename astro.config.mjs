import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://xirain.github.io",
  base: "/techlearn",
  prefetch: {
    prefetchAll: false,
    defaultStrategy: "hover",
  },
  integrations: [tailwind(), sitemap(), mdx()],
  markdown: {
    shikiConfig: {
      theme: "material-theme-darker",
      wrap: false
    }
  }
});
