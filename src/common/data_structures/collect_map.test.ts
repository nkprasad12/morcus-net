import { arrayMapBy } from "@/common/data_structures/collect_map";

describe("arrayMapBy", () => {
  it("sorts by expected key", () => {
    const list = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    const result = arrayMapBy(list, (data) => data.x);

    expect(result.map.size).toBe(2);
    expect(result.get(1)).toStrictEqual([list[0]]);
    expect(result.get(2)).toStrictEqual([list[1], list[2]]);
  });
});
