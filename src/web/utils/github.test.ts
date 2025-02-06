import { GitHub } from "@/web/utils/github";
import type { ReportApiRequest } from "@/web/api_routes";

const fetch = jest.fn();
global.fetch = fetch;

beforeEach(() => {
  fetch.mockClear();
});

const REQUEST: ReportApiRequest = {
  reportText: "TestTitle\nTestBody",
  commit: "abc",
  url: "foo.bar",
};

describe("reportIssue", () => {
  it("rejects on API error", async () => {
    fetch.mockImplementation(() => Promise.reject("Foo"));
    const request = GitHub.reportIssue(REQUEST, "token");
    await expect(request).rejects.toContain("Foo");
  });

  it("rejects on failed API", async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: false }));
    const request = GitHub.reportIssue(REQUEST, "token");
    await expect(request).rejects.toThrow();
  });

  it("resolves on successful API", async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: true }));
    const request = GitHub.reportIssue(REQUEST, "token");
    await expect(request).resolves.not.toThrow();
  });

  it("passes correct arguments", async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: true }));

    await GitHub.reportIssue(REQUEST, "token");

    const calls = fetch.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(
      "https://api.github.com/repos/nkprasad12/morcus-net/issues"
    );
    expect(calls[0][1].method).toBe("post");
  });
});
