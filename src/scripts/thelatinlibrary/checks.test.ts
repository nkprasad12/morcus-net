import {
  checkSequentialIds,
  crossCheck,
  findProvenanceStatements,
} from "@/scripts/thelatinlibrary/checks";
import { ConversionError } from "@/scripts/thelatinlibrary/page";

describe("findProvenanceStatements", () => {
  it("finds edition, copyright and permission statements", () => {
    expect(
      findProvenanceStatements(
        "Gallia est omnis divisa. Text edited by X, 1971."
      )
    ).toHaveLength(1);
    expect(
      findProvenanceStatements("This text copyright © 1980 Y")
    ).toHaveLength(2);
    expect(
      findProvenanceStatements("reproduced with the permission of Z")
    ).toHaveLength(1);
  });

  it("finds nothing in plain Latin text", () => {
    expect(
      findProvenanceStatements("Arma virumque cano, Troiae qui primus ab oris")
    ).toEqual([]);
  });
});

describe("crossCheck", () => {
  it("ignores u/v, i/j, case and chapter markers in the reference", () => {
    const rows: [string[], string][] = [
      [["1"], "Arma virumque cano Troiae qui primus ab oris"],
      [["2"], "Italiam fato profugus Laviniaque venit litora"],
    ];
    const reference =
      "[ 1 ] ARMA VIRVMQVE CANO TROIAE QVI PRIMVS AB ORIS [ 2 ] Italiam fato profugus Lauiniaque uenit litora";

    const result = crossCheck(rows, reference);

    expect(result.oursInRef).toBe(1);
    expect(result.refInOurs).toBeLessThan(1);
  });

  it("ignores section numbers kept in the reference", () => {
    const rows: [string[], string][] = [[["1"], "a b c d e f g h"]];
    expect(crossCheck(rows, "a b c 2 d e f 3 g h").oursInRef).toBe(1);
  });

  it("reports missing text", () => {
    const rows: [string[], string][] = [[["1"], "a b c d e f g h"]];
    expect(crossCheck(rows, "a b c d e").oursInRef).toBeCloseTo(0.25);
  });
});

describe("checkSequentialIds", () => {
  it("accepts sequential numeric ids with optional leading pr or thema", () => {
    expect(() => checkSequentialIds(["1", "2", "3"], "Test")).not.toThrow();
    expect(() => checkSequentialIds(["pr", "1", "2"], "Test")).not.toThrow();
    expect(() => checkSequentialIds(["thema", "1", "2"], "Test")).not.toThrow();
  });

  it("rejects gaps or out-of-order ids", () => {
    expect(() => checkSequentialIds(["1", "3"], "Test")).toThrow(
      ConversionError
    );
  });
});
