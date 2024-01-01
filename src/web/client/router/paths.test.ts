import { checkPresent } from "@/common/assert";
import { PagePath } from "@/web/client/router/paths";

describe("PagePath", () => {
  test("isValid requires leading /", () => {
    expect(PagePath.isValid("dicts")).toBe(false);
  });

  test("isValid allows only legal characters", () => {
    expect(PagePath.isValid("/dicts/foo_")).toBe(false);
  });

  test("isValid allows params", () => {
    expect(PagePath.isValid("/dicts/:foo")).toBe(true);
  });

  test("factory returns null on invalid", () => {
    expect(PagePath.of("/dicts/:foo_")).toBe(null);
  });

  test("factory returns object on valid", () => {
    const path = "/dicts/:foo";

    const result = PagePath.of(path);

    expect(result?.path).toBe(path);
    expect(result).toBeInstanceOf(PagePath);
  });

  test("parseParams with no params returns empty", () => {
    const path = "/hello/darkness/my/old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.parseParams(path));
  });

  test("parseParams with non-matching size returns null", () => {
    const path = "/hello/darkness/my/old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.parseParams("/hello/darkness")).toBe(null);
  });

  test("parseParams with non-matching chunk returns null", () => {
    const path = "/hello/darkness/my/old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.parseParams("/hello/darkness/my/new/friend")).toBe(null);
  });

  test("parseParams with params returns expected", () => {
    const path = "/hello/:darkness/my/:old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.parseParams("/hello/Gallia/my/est/friend")).toStrictEqual({
      darkness: "Gallia",
      old: "est",
    });
  });

  test("toUrlPath with params required but not passed returns empty", () => {
    const path = "/hello/:darkness/my/:old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.toUrlPath({ darkness: "Gallia" })).toBe(null);
  });

  test("toUrlPath with params not required returns path", () => {
    const path = "/hello/darkness/my/old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.toUrlPath()).toBe(path);
  });

  test("toUrlPath with params required and passed returns expected", () => {
    const path = "/hello/:darkness/my/:old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(pagePath.toUrlPath({ darkness: "Gallia", old: "est" })).toBe(
      "/hello/Gallia/my/est/friend"
    );
  });

  test("toUrlPath with extraneous params returns null", () => {
    const path = "/hello/:darkness/my/:old/friend";
    const pagePath = checkPresent(PagePath.of(path));
    expect(
      pagePath.toUrlPath({ darkness: "Gallia", old: "est", youve: "omnis" })
    ).toBe(null);
  });
});
