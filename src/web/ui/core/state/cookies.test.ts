import {
  COOKIE_MAX_AGE_ONE_YEAR,
  formatCookie,
  readCookie,
} from "@/web/ui/core/state/cookies.common";

describe("core/cookies.common", () => {
  describe("readCookie", () => {
    it("reads and decodes a named cookie from a multi-cookie string", () => {
      const header = "foo=bar; morcus_dicts=L%26S%3BGAF; other=baz";
      expect(readCookie(header, "morcus_dicts")).toBe("L&S;GAF");
    });

    it("returns null when named cookie is not present", () => {
      expect(readCookie("foo=bar; test=123", "morcus_dicts")).toBeNull();
    });

    it("returns null for null, undefined, or empty cookie string", () => {
      expect(readCookie(undefined, "test")).toBeNull();
      expect(readCookie(null, "test")).toBeNull();
      expect(readCookie("", "test")).toBeNull();
    });

    it("does not match a name that is a substring of another cookie name", () => {
      const header = "other_morcus_dicts=1; morcus_dicts_custom=2";
      expect(readCookie(header, "morcus_dicts")).toBeNull();
    });

    it("does not match a name embedded in another cookie's value", () => {
      const header = "settings=morcus_inflected=0; other=1";
      expect(readCookie(header, "morcus_inflected")).toBeNull();
    });

    it("handles cookie values containing equals signs", () => {
      const header = "token=abc=def==; id=123";
      expect(readCookie(header, "token")).toBe("abc=def==");
    });

    it("handles bare cookies without equals sign as empty string", () => {
      const header = "flag; other=1";
      expect(readCookie(header, "flag")).toBe("");
    });

    it("tolerates whitespace around names and delimiters", () => {
      const header = "   foo = bar  ;   morcus_inflected = 1   ";
      expect(readCookie(header, "morcus_inflected")).toBe("1");
    });

    it("safely handles malformed percent encoding without throwing URIError", () => {
      const header = "malformed=%E0%A4%A; valid=ok";
      expect(readCookie(header, "malformed")).toBe("%E0%A4%A");
      expect(readCookie(header, "valid")).toBe("ok");
    });
  });

  describe("formatCookie", () => {
    it("formats cookie with default attributes (Path=/, 1 year, SameSite=Lax)", () => {
      const cookie = formatCookie("morcus_dicts", "L&S;GAF");
      expect(cookie).toBe(
        `morcus_dicts=L%26S%3BGAF; Path=/; Max-Age=${COOKIE_MAX_AGE_ONE_YEAR}; SameSite=Lax`
      );
    });

    it("formats inflection cookie correctly with zero-cost encode", () => {
      expect(formatCookie("morcus_inflected", "1")).toBe(
        `morcus_inflected=1; Path=/; Max-Age=${COOKIE_MAX_AGE_ONE_YEAR}; SameSite=Lax`
      );
      expect(formatCookie("morcus_inflected", "0")).toBe(
        `morcus_inflected=0; Path=/; Max-Age=${COOKIE_MAX_AGE_ONE_YEAR}; SameSite=Lax`
      );
    });
  });

  describe("round-trip: formatCookie -> readCookie", () => {
    it("reads back the exact value formatted by formatCookie", () => {
      const original = "L&S;GAF;FOR";
      const formatted = formatCookie("morcus_dicts", original);
      expect(readCookie(formatted, "morcus_dicts")).toBe(original);
    });

    it("round-trips empty and boolean values correctly", () => {
      expect(readCookie(formatCookie("flag", "0"), "flag")).toBe("0");
      expect(readCookie(formatCookie("flag", "1"), "flag")).toBe("1");
      expect(readCookie(formatCookie("empty", ""), "empty")).toBe("");
    });

    it("round-trips complex characters, spaces, and punctuation", () => {
      const complex = "foo=bar&baz; qux=123+456 [latin: λόγος]";
      const formatted = formatCookie("payload", complex);
      expect(readCookie(formatted, "payload")).toBe(complex);
    });

    it("reads multiple formatted cookies joined as an HTTP Cookie header", () => {
      const cookie1 = formatCookie("morcus_dicts", "L&S;GAF");
      const cookie2 = formatCookie("morcus_inflected", "1");
      const cookie3 = formatCookie("theme", "dark");
      const header = `${cookie1}; ${cookie2}; ${cookie3}`;

      expect(readCookie(header, "morcus_dicts")).toBe("L&S;GAF");
      expect(readCookie(header, "morcus_inflected")).toBe("1");
      expect(readCookie(header, "theme")).toBe("dark");
    });
  });
});
