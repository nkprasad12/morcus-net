import { scrapeUrlText } from "@/web/scraping/scraper";
import fetch from "node-fetch";

// @ts-expect-error
const mockFetch: jest.Mock<any, any, any> = fetch;

jest.mock("node-fetch");

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
