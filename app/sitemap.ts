import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3810";
  return [{ url: base + "/", changeFrequency: "monthly", priority: 1 }];
}
