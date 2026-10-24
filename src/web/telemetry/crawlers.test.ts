import {
  isCrawler,
  KNOWN_CRAWLERS,
  matchCrawler,
} from "@/web/telemetry/crawlers";

describe("crawlers", () => {
  it("returns null for missing or empty User-Agent", () => {
    expect(matchCrawler(undefined)).toBeNull();
    expect(matchCrawler("")).toBeNull();
    expect(isCrawler(undefined)).toBe(false);
    expect(isCrawler("")).toBe(false);
  });

  it("matches every entry in KNOWN_CRAWLERS in both isCrawler and matchCrawler", () => {
    for (const [sub, expectedName] of KNOWN_CRAWLERS) {
      const ua = `Mozilla/5.0 (compatible; ${sub}/1.0)`;
      expect(isCrawler(ua)).toBe(true);
      expect(matchCrawler(ua)).toBe(expectedName);
    }
  });

  it.each([
    [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Googlebot",
    ],
    [
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)",
      "AdsBot-Google",
    ],
    [
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "bingbot",
    ],
    [
      "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
      "YandexBot",
    ],
    ["Mozilla/5.0 (compatible; yandex.com/bots)", "YandexBot"],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "GPTBot",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "OAI-SearchBot",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "ClaudeBot",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "PerplexityBot",
    ],
    [
      "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "Bytespider",
    ],
    [
      "Mozilla/5.0 (compatible; meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))",
      "Meta-ExternalAgent",
    ],
    [
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "SemrushBot",
    ],
    [
      "Sogou web spider/4.0(+http://www.sogou.com/docs/help/webmasters.htm#07)",
      "Sogou",
    ],
    ["Sogou inst spider/4.0", "Sogou"],
    [
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "AhrefsBot",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/121.0.0.0 Safari/537.36",
      "HeadlessChrome",
    ],
    ["python-requests/2.31.0", "python-requests"],
    ["curl/8.5.0", "curl"],
    ["Go-http-client/2.0", "Go-http-client"],
  ])("identifies known crawler %s -> %s", (ua, expected) => {
    expect(matchCrawler(ua)).toBe(expected);
    expect(isCrawler(ua)).toBe(true);
  });

  it("catches unknown crawlers via generic fallback token", () => {
    expect(matchCrawler("Mozilla/5.0 (compatible; MysterySuperBot/2.0)")).toBe(
      "OtherBot:MysterySuperBot"
    );
    expect(matchCrawler("AcmeWebScraper/1.0")).toBe("OtherBot:AcmeWebScraper");
    expect(matchCrawler("latin-corpus-spider/0.1")).toBe(
      "OtherBot:latin-corpus-spider"
    );
    expect(isCrawler("Mozilla/5.0 (compatible; MysterySuperBot/2.0)")).toBe(
      true
    );
  });

  it("does not misclassify real desktop and mobile browsers or Cubot phones", () => {
    const realBrowsers = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
      "Mozilla/5.0 (Linux; Android 11; CUBOT MAX 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
      // Sogou's browsers, not its crawler.
      "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.25 Safari/537.36 Core/1.70.3741.400 QQBrowser/10.5.3863.400 SE 2.X MetaSr 1.0",
      "Mozilla/5.0 (Linux; Android 10; MI 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.80 Mobile Safari/537.36 SogouMobileBrowser/6.4.5",
    ];
    for (const ua of realBrowsers) {
      expect(matchCrawler(ua)).toBeNull();
      expect(isCrawler(ua)).toBe(false);
    }
  });
});
