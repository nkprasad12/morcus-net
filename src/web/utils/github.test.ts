import fetch from "node-fetch";
import { GitHub } from "./github";

jest.mock("node-fetch");

beforeAll(() => {
  process.env.GITHUB_TOKEN = "token";
});

beforeEach(() => {
  // @ts-ignore
  fetch.mockClear();
});

describe("reportIssue", () => {
  it("rejects on API error", async () => {
    // @ts-ignore
    fetch.mockImplementation(() => Promise.reject("Foo"));
    const request = GitHub.reportIssue("TestTitle\nTestBody", "abc");
    expect(request).rejects.toContain("Foo");
  });

  it("rejects on failed API", async () => {
    // @ts-ignore
    fetch.mockImplementation(() => Promise.resolve({ ok: false }));
    const request = GitHub.reportIssue("TestTitle\nTestBody", "abc");
    expect(request).rejects.toThrow();
  });

  it("resolves on successful API", async () => {
    // @ts-ignore
    fetch.mockImplementation(() => Promise.resolve({ ok: true }));
    const request = GitHub.reportIssue("TestTitle\nTestBody", "abc");
    expect(request).resolves;
  });

  it("passes correct arguments", async () => {
    // @ts-ignore
    fetch.mockImplementation(() => Promise.resolve({ ok: true }));

    await GitHub.reportIssue("TestTitle\nTestBody", "abc");

    // @ts-ignore
    const calls = fetch.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(
      "https://api.github.com/repos/nkprasad12/morcus-net/issues"
    );
    expect(calls[0][1].method).toBe("post");
  });
});
