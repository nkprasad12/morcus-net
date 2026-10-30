# What's New (`src/web/ui/whats_new/`)

## Overview

Surfaces new `#release` posts from `https://updates.morcus.net/latest.json` inline on the dictionary landing page (`/` and `/dicts`) for returning visitors, once per release, within a 10-day freshness window (`WHATS_NEW_MAX_AGE_DAYS = 10`).

## Architecture (SSR + Pre-Paint + Runtime Static Override)

1. **Server Poller (`whats_new.server.ts`)**: `LatestPostPoller` polls `latest.json` on startup and hourly, validates the payload (`YYYY-MM-DD` date, `https://updates.morcus.net/` URL, length-capped description), and exposes `current(now)` which returns `null` when no post is within 10 days.
2. **SSR & Pre-Paint CSS (`dict_landing.server.ts`, `dict_page.server.ts`, `dict_landing.css`)**: When an active post is present, SSR renders a `#whats-new` banner at the top of the landing page (hidden by default in `dict_landing.css`; no dismiss button) and emits a one-rule `<style>` in `<head>` that shows it on `html[data-wn-seen]:not([data-wn-seen="<date>"])`. `critical.js` copies `morcus_prepaint` onto `<html>` before first paint, so the banner is laid out from the first frame with zero CLS. The banner is additive (the welcome line is never hidden) and lives inside `#dict-results`, so a search swaps it out with the rest of the landing page.
3. **2-Key Static Page Overlay (`dict_routes.server.ts`, `static_pages.server.ts`)**: `withDictLandingOverrides` overlays the two default non-embedded landing keys (`dict:<defaultBitmask>:1:0:root` and `dict:<defaultBitmask>:1:0`) in memory when a post is active, and clears the overlay when none is active so requests fall back to `build/pages.db`.
4. **Client Recording (`dict_search.client.ts`)**: `<morcus-dict-search>` records `data-wn-seen` via `recordPrepaint` on every landing visit (`wnDate` when a post is active, or `"0"` for first-time visitors during quiet periods) without touching `<html>`, so the banner stays up for the current visit and is gone on the next.
