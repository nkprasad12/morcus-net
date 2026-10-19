import { envVar } from "@/common/env_vars";
import { MANIFEST_COLOR } from "@/web/ui/shell/theme_color.common";

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
  // Every page, so links between pages stay inside the installed app's window.
  scope: "/",
  background_color: MANIFEST_COLOR,
  theme_color: MANIFEST_COLOR,
  display: "standalone",
  // Long-press / right-click entries on the app icon.
  shortcuts: [
    { name: "Dictionary", url: "/dicts" },
    { name: "Library", url: "/library" },
    { name: "Corpus", url: "/corpus" },
    { name: "Macronizer", url: "/macronizer" },
  ],
  related_applications: [
    {
      platform: "webapp",
      url: "/public/pwa.webmanifest",
    },
  ],
};
