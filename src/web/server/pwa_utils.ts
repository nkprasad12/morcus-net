import { envVar } from "@/common/env_vars";

export const PWA_WEBMANIFEST = {
  name: "Morcus Latin Tools" + envVar("PWA_SHORT_NAME_SUFFIX"),
  short_name: "Morcus" + envVar("PWA_SHORT_NAME_SUFFIX"),
  description: "A collection of free tools for Latin learners, by Mórcus.",
  icons: [
    {
      src: "/public/favicon.ico",
      type: "image/png",
      sizes: "48x48",
    },
    {
      src: "/public/logo192.png",
      type: "image/png",
      sizes: "192x192",
    },
    {
      src: "/public/logo512.png",
      type: "image/png",
      sizes: "512x512",
    },
  ],
  id: "/",
  start_url: "/",
  background_color: "#f2f3f2",
  theme_color: "#bfdecf",
  display: "standalone",
  related_applications: [
    {
      platform: "webapp",
      url: "/public/pwa.webmanifest",
    },
  ],
};
