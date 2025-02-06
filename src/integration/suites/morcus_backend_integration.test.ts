import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";

import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { ServerMessage } from "@/web/utils/rpc/rpc";
import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";

import { test, expect } from "@playwright/test";

test.beforeAll(() => {
  global.location = {
    // @ts-ignore
    origin: process.env.BASE_URL,
  };
});

test.describe("morcus.net backend integration", { tag: "@backend" }, () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "Backend integration does not use the browser, so only needs to run once."
  );

  test("serves PWA manifest", async () => {
    const req = await fetch(`${global.location.origin}/public/pwa.webmanifest`);
    const manifest = await req.json();
    expect(manifest.name).toBe("Morcus Latin Tools");
    expect(manifest.short_name).toBe("Morcus");
  });

  test("returns LS results in uninflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "canaba",
      dicts: [LatinDict.LewisAndShort.key],
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("cannăba")).toBe(true);
  });

  test("returns LS results in inflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "undarum",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("billow")).toBe(true);
  });

  test("returns LS results in inflected mode with diacritics", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "occīdit",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("occīdo")).toBe(true);
    expect(articles[0].entry.toString().includes("occĭdo")).toBe(false);
  });

  test("returns LS results in inflected mode with capitals", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "Undarum",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("wave")).toBe(true);
  });

  test("returns LS results in inflected mode with weird characters", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "Ægyptus",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).not.toHaveLength(0);
    expect(articles[0].entry.toString().includes("Aegyptus")).toBe(true);
  });

  test("returns LS results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "n1153",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("ἀηδών")).toBe(true);
  });

  test("returns SH results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "sh2708",
      dicts: [LatinDict.SmithAndHall.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("caerŭlĕus")).toBe(true);
  });

  test("returns SH results", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "influence",
      dicts: [LatinDict.SmithAndHall.key],
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(2);
    expect(articles[0].entry.toString().includes("Power exerted")).toBe(true);
    expect(articles[1].entry.toString().includes("impello")).toBe(true);
  });

  test("returns expected library result list", async () => {
    const result = await callApiFull(ListLibraryWorks, {});

    const works = result.data;
    expect(
      works.filter((work) => work.id === "phi0448.phi001.perseus-lat2")
    ).toHaveLength(1);
  });

  test("returns DBG by id", async () => {
    const result = await callApiFull(GetWork, {
      id: "phi0448.phi001.perseus-lat2",
    });
    expect(result.data.info.title).toBe("De bello Gallico");
  });

  test("returns DBG by name and author", async () => {
    const result = await callApiFull(GetWork, {
      nameAndAuthor: {
        urlAuthor: "caesar",
        urlName: "de_bello_gallico",
      },
    });
    expect(result.data.info.title).toBe("De bello Gallico");
  });

  test("handles concurrent requests", async () => {
    const fetchHabeo = () =>
      callApiFull(DictsFusedApi, {
        query: "habeo",
        dicts: [LatinDict.LewisAndShort.key],
      });

    const requests: Promise<ServerMessage<DictsFusedResponse>>[] = [];
    for (const _ of Array(10).fill(0)) {
      requests.push(fetchHabeo());
    }
    await Promise.all(requests);

    for (const result of requests) {
      const articles = (await result).data[LatinDict.LewisAndShort.key];
      expect(articles).toHaveLength(1);
      expect(articles[0].entry.toString().includes("to have")).toBe(true);
    }
  });
});
