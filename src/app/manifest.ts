import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: config.brandName, short_name: config.brandName, description: "Myanmar's home for tech events & opportunities.",
    start_url: "/", scope: "/", display: "standalone", background_color: "#f3f0e8", theme_color: "#f3f0e8", lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
