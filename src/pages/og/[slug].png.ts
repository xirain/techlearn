import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import satori from "satori";
import { html } from "satori-html";
import sharp from "sharp";
import { SITE } from "@/config";

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { title: post.data.title, description: post.data.description },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const { title, description } = props;

  // Use system font - fetch Inter from Google Fonts
  const fontRes = await fetch(
    "https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap"
  );
  const css = await fontRes.text();
  const fontUrlMatch = css.match(/src: url\((.+?)\)/);
  let fontData: ArrayBuffer;

  if (fontUrlMatch) {
    const fontFileRes = await fetch(fontUrlMatch[1]);
    fontData = await fontFileRes.arrayBuffer();
  } else {
    // Fallback: use a minimal font buffer (won't happen in practice)
    fontData = new ArrayBuffer(0);
  }

  const markup = html`
    <div
      style="display: flex; flex-direction: column; justify-content: center; width: 1200px; height: 630px; background: linear-gradient(135deg, #fdfbf7 0%, #f5f1eb 100%); padding: 60px; font-family: Inter;"
    >
      <div
        style="display: flex; flex-direction: column; gap: 20px; max-width: 900px;"
      >
        <div
          style="font-size: 52px; font-weight: 700; color: #22573b; line-height: 1.2;"
        >
          ${title}
        </div>
        <div
          style="font-size: 24px; color: #736d65; line-height: 1.5;"
        >
          ${description}
        </div>
      </div>
      <div
        style="display: flex; align-items: center; gap: 12px; margin-top: auto; font-size: 20px; color: #b45337;"
      >
        ${SITE.title}
      </div>
    </div>
  `;

  const svg = await satori(markup, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Inter",
        data: fontData,
        weight: 700,
        style: "normal",
      },
    ],
  });

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
