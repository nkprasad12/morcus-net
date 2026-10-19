import { scrapeUrlText, scrapeUrlTextWith } from "@/web/scraping/scraper";
import { UnsafeUrlError } from "@/web/scraping/safe_fetch";

const PAGE_URL = "https://foo.bar";

function fetcherFor(text: string) {
  return jest.fn((url: string) =>
    url === PAGE_URL
      ? Promise.resolve({ text })
      : Promise.reject(new Error(`Bad path: ${url}`))
  );
}

describe("Scraper", () => {
  test("scrapeUrlText happy path", async () => {
    const fetcher = fetcherFor("<html><body>Hello<br>Hi</body></html>");
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    expect(result).toBe("Hello\nHi");
  });

  test("scrapeUrlText with circumflex", async () => {
    const fetcher = fetcherFor(
      "<html><body>eskammena pêdô misô.</body></html>"
    );
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    expect(result).toBe("eskammena pêdô misô.");
  });

  test("scrapeUrlText url without protocol corrects", async () => {
    const fetcher = fetcherFor("<html><body>Hello<br>Hi</body></html>");
    const result = await scrapeUrlTextWith("foo.bar", fetcher);
    expect(result).toBe("Hello\nHi");
  });

  test("scrapeUrlText handles text with divs and br", async () => {
    const fetcher = fetcherFor(
      "<html><body>Hello<br><div>Hi</div></body></html>"
    );
    const result = await scrapeUrlTextWith("foo.bar", fetcher);
    expect(result).toBe("Hello\n\nHi\n");
  });

  test("scrapeUrlText handles modern HTML5 tags and skips non-text subtrees", async () => {
    const fetcher = fetcherFor(
      "<!doctype html><html><head><title>T</title><style>p{}</style></head><body><header><nav><ul><li>Home</li></ul></nav></header><main><article><section><p>Gallia est <em>omnis</em> divisa</p></section></article></main><script>var x=1</script></body></html>"
    );
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    expect(result).toContain("Gallia est omnis divisa");
    expect(result).not.toContain("var x");
    expect(result).not.toContain("p{}");
    expect(result).not.toContain("T");
  });

  test("scrapeUrlText handles HTML void elements without swallowing siblings", async () => {
    const fetcher = fetcherFor(
      "<p>a<img src=x>b<hr>c<input type=text><meta charset=utf-8><link rel=stylesheet href=y>d</p>"
    );
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    expect(result).toContain("ab");
    expect(result).toContain("cd");
  });

  test("scrapeUrlText traverses unknown custom elements inline", async () => {
    const fetcher = fetcherFor("<x-foo>arma</x-foo>");
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    expect(result).toContain("arma");
  });

  test("scrapeUrlText separates block elements like li onto separate lines", async () => {
    const fetcher = fetcherFor("<li>one</li><li>two</li>");
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    const lines = result
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines).toEqual(["one", "two"]);
  });

  test("scrapeUrlText handles implicit body", async () => {
    const fetcher = fetcherFor("<p>virumque</p>");
    const result = await scrapeUrlTextWith(PAGE_URL, fetcher);
    expect(result.trim()).toBe("virumque");
  });

  // The production entry point must go through the SSRF guard. Private
  // literals are refused before any network activity, so this is offline.
  test.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "localhost:8080",
    "file:///etc/passwd",
  ])("scrapeUrlText refuses %s", async (url) => {
    await expect(scrapeUrlText(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  test("scrapeUrlText ignores extra positional arguments from the RPC layer", async () => {
    // RouteDefinition calls handlers as handler(input, { log }, ...). A second
    // parameter on scrapeUrlText would receive that object.
    const handler: (...args: unknown[]) => Promise<string> = scrapeUrlText as (
      ...args: unknown[]
    ) => Promise<string>;
    await expect(
      handler("http://127.0.0.1/", { log: () => {} })
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
