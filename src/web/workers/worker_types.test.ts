import { Workers } from "@/web/workers/worker_types";

describe("Workers.isValid", () => {
  it("rejects invalid inputs", () => {
    expect(Workers.isValid("Caesar")).toBe(false);
  });

  it("allows valid inputs", () => {
    expect(Workers.isValid(Workers.MACRONIZER)).toBe(true);
  });
});
