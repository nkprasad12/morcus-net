import { getBullet } from "./ls_outline";

describe("getBullet", () => {
  it("returns original on unparenthesized", () => {
    expect(getBullet("I")).toBe("I");
  });

  it("returns Greek character on known parenthesized", () => {
    expect(getBullet("(d)")).toBe("δ");
  });

  it("returns original on unknown parenthesized", () => {
    expect(getBullet("(*d)")).toBe("(*d)");
  });
});
