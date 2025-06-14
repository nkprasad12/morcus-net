import { scrapeUrlText } from "@/web/scraping/scraper";

const mockFetch: jest.Mock<any, any, any> = jest.fn();
global.fetch = mockFetch;

const PAGE_URL = "https://foo.bar";

function setFetchPage(text: string) {
  mockFetch.mockImplementation((url) =>
    url === PAGE_URL
      ? Promise.resolve({
          ok: true,
          text: () => Promise.resolve(text),
        })
      : Promise.reject("Bad path")
  );
}

describe("Scraper", () => {
  test("scrapeUrlText happy path", async () => {
    setFetchPage("<html><body>Hello<br>Hi</body></html>");
    const result = await scrapeUrlText(PAGE_URL);
    expect(result).toBe("Hello\nHi");
  });

  test("scrapeUrlText with circumflex", async () => {
    setFetchPage("<html><body>eskammena pêdô misô.</body></html>");
    const result = await scrapeUrlText(PAGE_URL);
    expect(result).toBe("eskammena pêdô misô.");
  });

  test("scrapeUrlText url without protocol corrects", async () => {
    setFetchPage("<html><body>Hello<br>Hi</body></html>");
    const result = await scrapeUrlText("foo.bar");
    expect(result).toBe("Hello\nHi");
  });

  test("scrapeUrlText handles text with divs and br", async () => {
    setFetchPage("<html><body>Hello<br><div>Hi</div></body></html>");
    const result = await scrapeUrlText("foo.bar");
    expect(result).toBe("Hello\n\nHi\n");
  });
});
