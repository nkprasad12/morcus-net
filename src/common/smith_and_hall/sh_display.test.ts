import { displayShEntry } from "@/common/smith_and_hall/sh_display";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";

const TEST_ENTRY: ShEntry = {
  keys: ["Hi", "Hello"],
  blurb: "Greetings",
  senses: [
    { level: 1, bullet: "I", text: "'lo" },
    { level: 2, bullet: "1", text: "heeelo" },
    { level: 1, bullet: "II", text: "suup" },
  ],
};

describe("displayShEntry", () => {
  it("displays nested senses correctly", () => {
    const result = displayShEntry(TEST_ENTRY, 57);
    expect(result.toString()).toEqual(
      [
        `<div>`,
        `<div id="sh57"><span class="lsSenseBullet" senseid="sh57"> ‣ </span> Greetings</div>`,
        `<ol class="lsTopSense"><li id="sh57.0"><span class="lsSenseBullet" senseid="sh57.0"> I </span>'lo</li>`,
        `<ol><li id="sh57.1"><span class="lsSenseBullet" senseid="sh57.1"> 1 </span>heeelo</li></ol>`,
        `<li id="sh57.2"><span class="lsSenseBullet" senseid="sh57.2"> II </span>suup</li></ol>`,
        `</div>`,
      ].join("")
    );
  });
});
