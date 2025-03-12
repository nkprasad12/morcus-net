import fs from "fs";
import path from "path";

import { rewriteRegularLemmata } from "@/morceus/stem_rewriting";
import { replaceEnvVar } from "@/common/test_helpers";
import { randomUUID } from "crypto";

console.debug = jest.fn();
const TEMP_DIR = "stem_rewriting_test-tmpdata";
replaceEnvVar("MORCEUS_DATA_ROOT", TEMP_DIR);

const BASE_NOM_CONTENT = `
# Vita
:le:vita
:no:vit a_ae fem

A^chilles
:le:Achilles
:no:A^chill es_is masc
:wd:Achille_n masc acc sg

#@ Placeholder
:le:noun
:no:noun uos_ou masc
`;

const BASE_VERB_CONTENT = `
:le:acclaro
:de:ac-cla_r are_vb
:de:ad-cla_r are_vb

:le:acclino
:de:ac-cli_n are_vb
:de:ad-cli_n are_vb`;

describe("stem_rewriting", () => {
  function deleteTempDir() {
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch (err) {
      console.error("Failed to remove temporary directory", err);
    }
  }

  beforeEach(() => {
    deleteTempDir();
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(deleteTempDir);

  function createStemFiles(allContents: string[]): string[] {
    return allContents.map((content, index) => {
      const fileName = `file_${index}_${randomUUID()}.txt`;
      const filePath = path.join(TEMP_DIR, fileName);
      fs.writeFileSync(filePath, content);
      return fileName;
    });
  }

  function stemFileContent(fileName: string): string {
    return fs.readFileSync(path.join(TEMP_DIR, fileName), "utf8");
  }

  test("rewriteRegularLemmata should not modify files when updater returns undefined", () => {
    const nomFilePath = createStemFiles([BASE_NOM_CONTENT])[0];
    const verbFilePath = createStemFiles([BASE_VERB_CONTENT])[0];

    rewriteRegularLemmata(() => undefined, [nomFilePath], [verbFilePath]);

    expect(stemFileContent(nomFilePath)).toBe(BASE_NOM_CONTENT);
    expect(stemFileContent(verbFilePath)).toBe(BASE_VERB_CONTENT);
  });

  test("rewriteRegularLemmata should not modify files when updater returns exact copy", () => {
    const nomFilePath = createStemFiles([BASE_NOM_CONTENT])[0];
    const verbFilePath = createStemFiles([BASE_VERB_CONTENT])[0];

    rewriteRegularLemmata((l) => l, [nomFilePath], [verbFilePath]);

    expect(stemFileContent(nomFilePath)).toEqual(BASE_NOM_CONTENT);
    expect(stemFileContent(verbFilePath)).toBe(BASE_VERB_CONTENT);
  });
});
