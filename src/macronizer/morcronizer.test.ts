import { macronizeInput } from "@/macronizer/morcronizer";

describe("macronizeInput", () => {
  it("should reject input exceeding character limit", async () => {
    const longText = "a".repeat(10001);
    await expect(macronizeInput(longText)).rejects.toThrow(/Input long/);
  });
});
