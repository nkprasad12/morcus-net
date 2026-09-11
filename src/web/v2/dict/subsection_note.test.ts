import { XmlNode } from "@/common/xml/xml_node";
import {
  DictSubsectionResult,
  EntryResult,
} from "@/common/dictionaries/dict_result";
import {
  collectXmlIds,
  dedupeSubsections,
  matchedAnchorIds,
  renderSubsectionNote,
  resolveSubsectionAnchor,
} from "@/web/v2/dict/subsection_note.server";
import { renderEntryResult } from "@/web/v2/dict/entry_view.server";
import { dedupeInflections } from "@/web/v2/dict/inflection_table.server";

/** Builds an entry shaped like Lewis & Short output. */
function entryXml(entryId: string, senseIds: string[]): XmlNode {
  return new XmlNode(
    "div",
    [
      ["id", entryId],
      ["class", "lsEntryFree"],
    ],
    [
      new XmlNode("div", [["id", `${entryId}.blurb`]], ["opening blurb"]),
      new XmlNode(
        "ol",
        [],
        senseIds.map((id) => new XmlNode("li", [["id", id]], [`sense ${id}`]))
      ),
    ]
  );
}

function entryResult(
  entryId: string,
  senseIds: string[],
  subsections: DictSubsectionResult[],
  mainKey = "propior"
): EntryResult {
  return {
    entry: entryXml(entryId, senseIds),
    outline: {
      mainKey,
      mainSection: {
        text: "blurb",
        level: 0,
        ordinal: "",
        sectionId: entryId,
      },
    },
    subsections,
  };
}

describe("collectXmlIds", () => {
  it("finds ids at every depth", () => {
    const ids = collectXmlIds(entryXml("n1", ["n1.1", "n1.2"]));
    expect(ids).toEqual(new Set(["n1", "n1.blurb", "n1.1", "n1.2"]));
  });

  it("handles string children", () => {
    expect(collectXmlIds("just text")).toEqual(new Set());
  });
});

describe("resolveSubsectionAnchor", () => {
  const present = new Set(["n1", "n1.blurb", "n1.1"]);

  it("uses the subsection id when the element exists", () => {
    expect(resolveSubsectionAnchor("n1.1", "n1", present)).toEqual({
      anchor: "n1.1",
      isBlurb: false,
    });
  });

  it("falls back to the blurb for a merged first sense", () => {
    // `.0` senses are folded into the opening blurb, so no element carries
    // that id and the raw anchor would be dead.
    expect(resolveSubsectionAnchor("n1.0", "n1", present)).toEqual({
      anchor: "n1.blurb",
      isBlurb: true,
    });
  });

  it("falls back to the entry root when there is no blurb", () => {
    expect(resolveSubsectionAnchor("n1.0", "n1", new Set(["n1"]))).toEqual({
      anchor: "n1",
      isBlurb: true,
    });
  });

  it("reports no anchor when nothing matches", () => {
    expect(resolveSubsectionAnchor("n1.0", "n1", new Set())).toEqual({
      isBlurb: false,
    });
  });
});

describe("dedupeSubsections", () => {
  const present = new Set(["n1", "n1.blurb", "n1.1", "n1.2"]);

  it("groups repeated names and keeps each target", () => {
    const groups = dedupeSubsections(
      [
        { id: "n1.1", name: "proximus" },
        { id: "n1.2", name: "proximus" },
      ],
      "n1",
      present
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("proximus");
    expect(groups[0].targets.map((t) => t.anchor)).toEqual(["n1.1", "n1.2"]);
  });

  it("drops repeated ids so one sense yields one chip", () => {
    // The same sense is reachable through several orthographic variants.
    const groups = dedupeSubsections(
      [
        { id: "n1.1", name: "Palatinus" },
        { id: "n1.1", name: "palatinus" },
      ],
      "n1",
      present
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].targets).toHaveLength(1);
  });

  it("keeps distinct names apart", () => {
    const groups = dedupeSubsections(
      [
        { id: "n1.1", name: "alpha" },
        { id: "n1.2", name: "beta" },
      ],
      "n1",
      present
    );
    expect(groups.map((g) => g.name)).toEqual(["alpha", "beta"]);
  });

  it("merges inflections across grouped subsections", () => {
    const groups = dedupeSubsections(
      [
        {
          id: "n1.1",
          name: "proximus",
          inflections: [{ form: "proximus", lemma: "propior", data: "a" }],
        },
        {
          id: "n1.2",
          name: "proximus",
          inflections: [{ form: "proximus", lemma: "propior", data: "b" }],
        },
      ],
      "n1",
      present
    );
    expect(groups[0].inflections).toHaveLength(2);
  });
});

describe("dedupeInflections", () => {
  it("removes analyses that render identically", () => {
    const deduped = dedupeInflections([
      { form: "gallus", lemma: "gallus", data: "masc nom sg" },
      { form: "Gallus", lemma: "gallus", data: "masc nom sg" },
      { form: "gallus", lemma: "gallus", data: "masc nom sg" },
    ]);
    expect(deduped).toHaveLength(2);
  });

  it("keeps analyses that differ only by usage note", () => {
    const deduped = dedupeInflections([
      { form: "gallus", lemma: "gallus", data: "masc nom sg" },
      {
        form: "gallus",
        lemma: "gallus",
        data: "masc nom sg",
        usageNote: "poetic",
      },
    ]);
    expect(deduped).toHaveLength(2);
  });
});

describe("renderSubsectionNote", () => {
  const present = new Set(["n1", "n1.blurb", "n1.1", "n1.2"]);
  const groupsFor = (subsections: DictSubsectionResult[]) =>
    dedupeSubsections(subsections, "n1", present);

  it("renders nothing without subsections", () => {
    expect(renderSubsectionNote([])).toBe("");
  });

  it("links the headword itself for a single match", () => {
    const html = renderSubsectionNote(
      groupsFor([{ id: "n1.1", name: "proximus" }])
    );
    expect(html).toContain('class="v2-subsection-namelink" href="#n1.1"');
    expect(html).toContain("proximus");
    expect(html).not.toContain('class="v2-subsection-chip"');
  });

  it("renders numbered chips for repeated matches", () => {
    const html = renderSubsectionNote(
      groupsFor([
        { id: "n1.1", name: "proximus" },
        { id: "n1.2", name: "proximus" },
      ])
    );
    expect(html).toContain('href="#n1.1"');
    expect(html).toContain('href="#n1.2"');
    expect(html.match(/v2-subsection-chip"/g)).toHaveLength(2);
  });

  it("points a merged first sense at the blurb, not a dead anchor", () => {
    const html = renderSubsectionNote(
      groupsFor([{ id: "n1.0", name: "proximus" }])
    );
    expect(html).toContain('href="#n1.blurb"');
    expect(html).not.toContain('href="#n1.0"');
  });

  it("uses an upward arrow for blurb targets and downward otherwise", () => {
    const up = renderSubsectionNote(
      groupsFor([{ id: "n1.0", name: "proximus" }])
    );
    const down = renderSubsectionNote(
      groupsFor([{ id: "n1.1", name: "proximus" }])
    );
    expect(up).toContain("M7.41 15.41");
    expect(down).toContain("M7.41 8.59");
  });

  it("omits the link when no anchor resolves", () => {
    const html = renderSubsectionNote(
      dedupeSubsections([{ id: "n1.9", name: "proximus" }], "n1", new Set())
    );
    expect(html).toContain("proximus");
    expect(html).not.toContain("href=");
  });

  it("joins several names with a serial conjunction", () => {
    const html = renderSubsectionNote(
      groupsFor([
        { id: "n1.1", name: "alpha" },
        { id: "n1.2", name: "beta" },
      ])
    );
    expect(html).toContain(" and ");
  });

  it("skips a subsection that merely repeats the headword", () => {
    const html = renderSubsectionNote(
      groupsFor([{ id: "n1.1", name: "propior" }]),
      { mainKey: "propior" }
    );
    expect(html).toBe("");
  });

  it("renders a lone analysis inline rather than as a table", () => {
    const html = renderSubsectionNote(
      groupsFor([
        {
          id: "n1.1",
          name: "proximus",
          inflections: [
            { form: "proxi^mus", lemma: "propior", data: "masc nom sg" },
          ],
        },
      ])
    );
    expect(html).toContain("v2-subsection-inline-inf");
    expect(html).not.toContain("<table");
    // Morpheus diacritics are decoded.
    expect(html).toContain("proxi\u0306mus".normalize("NFC"));
  });

  it("collapses multiple analyses into a closed details pane", () => {
    const html = renderSubsectionNote(
      groupsFor([
        {
          id: "n1.1",
          name: "proximus",
          inflections: [
            { form: "proximus", lemma: "propior", data: "masc nom sg" },
            { form: "proximum", lemma: "propior", data: "neut acc sg" },
          ],
        },
      ])
    );
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Inflections of proximus (2)");
  });

  it("escapes names", () => {
    const html = renderSubsectionNote(
      groupsFor([{ id: "n1.1", name: "<script>x</script>" }])
    );
    expect(html).not.toContain("<script>");
  });
});

describe("renderEntryResult with subsections", () => {
  it("renders the note and marks the matched element in the body", () => {
    const html = renderEntryResult(
      entryResult("n1", ["n1.1", "n1.2"], [{ id: "n1.1", name: "proximus" }])
    );
    expect(html).toContain("v2-subsection-note");
    expect(html).toContain('href="#n1.1"');
    expect(html).toContain('id="n1.1" class="v2-subsection-hit"');
    expect(html).toContain('aria-current="location"');
  });

  it("marks only the matched element", () => {
    const html = renderEntryResult(
      entryResult("n1", ["n1.1", "n1.2"], [{ id: "n1.1", name: "proximus" }])
    );
    expect(html.match(/v2-subsection-hit/g)).toHaveLength(1);
  });

  it("marks the blurb when the match is a merged first sense", () => {
    const html = renderEntryResult(
      entryResult("n1", ["n1.1"], [{ id: "n1.0", name: "proximus" }])
    );
    expect(html).toContain('id="n1.blurb" class="v2-subsection-hit"');
  });

  it("renders the note for entries that have no tools bar", () => {
    const result = entryResult(
      "n1",
      ["n1.1"],
      [{ id: "n1.1", name: "abbatissa" }]
    );
    const html = renderEntryResult(result);
    // No outline senses and no main inflections, so there is no segmented bar.
    expect(html).not.toContain("v2-segmented-bar");
    expect(html).toContain("v2-subsection-note");
  });

  it("leaves entries without subsections untouched", () => {
    const html = renderEntryResult(entryResult("n1", ["n1.1"], []));
    expect(html).not.toContain("v2-subsection-note");
    expect(html).not.toContain("v2-subsection-hit");
  });
});

describe("matchedAnchorIds", () => {
  it("collects resolved anchors and skips unresolved ones", () => {
    const groups = dedupeSubsections(
      [
        { id: "n1.1", name: "alpha" },
        { id: "n1.9", name: "beta" },
      ],
      "n1",
      new Set(["n1.1"])
    );
    expect(matchedAnchorIds(groups)).toEqual(new Set(["n1.1"]));
  });
});
