import { makeMorpheusDb } from "@/common/lexica/latin_words";
import { SAMPLE_MORPHEUS_OUTPUT } from "@/common/lexica/morpheus_testdata";
import {
  ShLinkResolver,
  displayShEntry,
} from "@/common/smith_and_hall/sh_display";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import { unlinkSync, writeFileSync } from "fs";

const MORPH_FILE = "sh_display.test.ts.tmp.morph.txt";
const INFL_DB_FILE = "sh_display.test.ts.tmp.lat.db";

beforeAll(() => {
  process.env.LATIN_INFLECTION_DB = INFL_DB_FILE;
  writeFileSync(MORPH_FILE, SAMPLE_MORPHEUS_OUTPUT);
  makeMorpheusDb(MORPH_FILE, INFL_DB_FILE);
});

afterAll(() => {
  try {
    unlinkSync(MORPH_FILE);
  } catch {}
  cleanupSqlTableFiles(INFL_DB_FILE);
});

const TEST_ENTRY: ShEntry = {
  keys: ["Hi", "Hello"],
  blurb: "<b>Greetings</b>",
  senses: [
    { level: 1, bullet: "I", text: "'lo" },
    { level: 2, bullet: "1", text: "heeelo" },
    { level: 1, bullet: "II", text: "<sc>suup</sc>" },
  ],
};

const ENTRY_WITH_LAT_LINKS: ShEntry = {
  keys: ["Hi"],
  blurb: "<b>Greetings</b>",
  senses: [{ level: 1, bullet: "I", text: "Salutations excibat" }],
};

const ENTRY_WITH_LINKS: ShEntry = {
  keys: ["Hi"],
  blurb: "<f>GREETINGS</f>",
  senses: [{ level: 1, bullet: "I", text: "<f>LO</f>" }],
};

function spoofEntries(input: string[][]): ShEntry[] {
  return input.map((keys) => ({ keys: keys, blurb: "", senses: [] }));
}

function verifyLinkMarkup(
  keys: string[][],
  link: string,
  to: string,
  text?: string
) {
  const entries = spoofEntries(keys);
  const result = displayShEntry(
    { keys: ["Hi"], blurb: `<f>${link}</f>`, senses: [] },
    57,
    new ShLinkResolver(entries)
  );
  expect(result.toString()).toEqual(
    [
      `<div>`,
      `<div id="sh57" class="QNA"><span class="lsSenseBullet" senseid="sh57">  •  </span> `,
      `<span class="dLink" to="${to}" text="${
        text || link.toLowerCase()
      }"></span></div>`,
      `<div></div>`,
      `</div>`,
    ].join("")
  );
}

describe("displayShEntry", () => {
  it("displays nested senses correctly", () => {
    const result = displayShEntry(TEST_ENTRY, 57, new ShLinkResolver([]));
    expect(result.toString()).toEqual(
      [
        `<div>`,
        `<div id="sh57" class="QNA"><span class="lsSenseBullet" senseid="sh57">  •  </span> <span class="lsOrth">Greetings</span></div>`,
        `<ol class="lsTopSense"><li id="sh57.0" class="QNA"><span class="lsSenseBullet" senseid="sh57.0"> I </span>'lo</li>`,
        `<ol><li id="sh57.1" class="QNA"><span class="lsSenseBullet" senseid="sh57.1"> 1 </span>heeelo</li></ol>`,
        `<li id="sh57.2" class="QNA"><span class="lsSenseBullet" senseid="sh57.2"> II </span><i>suup</i></li></ol>`,
        `</div>`,
      ].join("")
    );
  });

  it("displays unknown links correctly", () => {
    const result = displayShEntry(ENTRY_WITH_LINKS, 57, new ShLinkResolver([]));
    expect(result.toString()).toEqual(
      [
        `<div>`,
        `<div id="sh57" class="QNA"><span class="lsSenseBullet" senseid="sh57">  •  </span> <span>GREETINGS</span></div>`,
        `<ol class="lsTopSense"><li id="sh57.0" class="QNA">`,
        `<span class="lsSenseBullet" senseid="sh57.0"> I </span><span>LO</span>`,
        `</li></ol>`,
        `</div>`,
      ].join("")
    );
  });

  it("adds links for Latin words", () => {
    const result = displayShEntry(
      ENTRY_WITH_LAT_LINKS,
      57,
      new ShLinkResolver([])
    );

    expect(result.toString()).toContain(
      `<span class="latWord" to="excibat"></span>`
    );
  });

  it("displays known links correctly in blurb and sense", () => {
    const keys = [["greetings"], ["lo"]];
    const entries = spoofEntries(keys);
    const result = displayShEntry(
      ENTRY_WITH_LINKS,
      57,
      new ShLinkResolver(entries)
    );
    expect(result.toString()).toEqual(
      [
        `<div>`,
        `<div id="sh57" class="QNA"><span class="lsSenseBullet" senseid="sh57">  •  </span> <span class="dLink" to="greetings" text="greetings"></span></div>`,
        `<ol class="lsTopSense"><li id="sh57.0" class="QNA">`,
        `<span class="lsSenseBullet" senseid="sh57.0"> I </span><span class="dLink" to="lo" text="lo"></span>`,
        `</li></ol>`,
        `</div>`,
      ].join("")
    );
  });

  it("expands v. LINK abbreviations", () => {
    const entry: ShEntry = {
      keys: ["Hi"],
      blurb: "<b>Hi</b>: v. <f>Hello</f>",
      senses: [],
    };
    const result = displayShEntry(entry, 57, new ShLinkResolver([]));
    expect(result.toString()).toEqual(
      [
        '<div><div id="sh57" class="QNA"><span class="lsSenseBullet" senseid="sh57">  •  </span>',
        ' <span class="lsOrth">Hi</span>: ',
        '<span class="lsHover" title="Originally: v.">see</span>',
        " <span>Hello</span></div><div></div></div>",
      ].join("")
    );
  });

  it("adds hover span when needed", () => {
    const entry: ShEntry = {
      keys: ["Hi"],
      blurb: "<b>Hi</b>: q. v.",
      senses: [],
    };
    const result = displayShEntry(entry, 57, new ShLinkResolver([]));
    expect(result.toString()).toEqual(
      [
        '<div><div id="sh57" class="QNA"><span class="lsSenseBullet" senseid="sh57">  •  </span>',
        ' <span class="lsOrth">Hi</span>: ',
        '<span class="lsHover" title="quod vide, videas (look it up in that entry)">q. v.</span>',
        "</div><div></div></div>",
      ].join("")
    );
  });

  it("handles <sc> edge case", () => {
    const keys = [["greetings"], ["lo"]];
    verifyLinkMarkup(keys, "<sc>LO</sc>", "lo", "lo");
  });

  it("removes leading to", () => {
    const keys = [["go"]];
    verifyLinkMarkup(keys, "TO GO", "go");
  });

  it("removes paren text with TO", () => {
    const keys = [["go"]];
    verifyLinkMarkup(keys, "TO GO (BLAH)", "go");
  });

  it("resolved keys with dashes", () => {
    const keys = [["under-go"]];
    verifyLinkMarkup(keys, "TO UNDERGO", "under-go");
  });

  it("resolves link edge cases", () => {
    const keys = [["cann"]];
    verifyLinkMarkup(keys, "CANNOT", "can");
  });

  it("resolves simple -ing edge cases", () => {
    const keys = [["front"]];
    verifyLinkMarkup(keys, "FRONTING", "front");
  });

  it("resolves e -ing edge cases", () => {
    const keys = [["continue"]];
    verifyLinkMarkup(keys, "CONTINUING", "continue");
  });

  it("resolves replaced suffix edge cases", () => {
    const keys = [["ostracize"]];
    verifyLinkMarkup(keys, "TO OSTRACISE", "ostracize");
  });

  it("attempts to remove plural s only if needed", () => {
    const keys = [["flag"], ["swims", "swim"]];
    verifyLinkMarkup(keys, "FLAGS", "flag");
    verifyLinkMarkup(keys, "SWIMS", "swims");
  });

  it("resolves to shortest containing entry", () => {
    const keys = [["spanner", "spanning"]];
    verifyLinkMarkup(keys, "SPAN", "spanner");
  });

  it("tries to remove period", () => {
    const keys = [["spanner"]];
    verifyLinkMarkup(keys, "SPAN.", "spanner");
  });

  it("ignores after comma", () => {
    const keys = [["spanner"]];
    verifyLinkMarkup(keys, "SPAN, ABC", "spanner");
  });

  it("removes dashes but only if needed", () => {
    const keys = [["thereupon"], ["easygoing", "easy-going"]];
    verifyLinkMarkup(keys, "THERE-UPON", "thereupon");
    verifyLinkMarkup(keys, "EASY-GOING", "easy-going");
  });

  it("attempts to remove final LY", () => {
    const keys = [["quick"]];
    verifyLinkMarkup(keys, "QUICKLY", "quick");
  });
});
