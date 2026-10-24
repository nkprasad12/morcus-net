import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_HELPER_IMAGE_NAMES,
  HELPER_IMAGES,
  isHelperImageName,
} from "@/scripts/helper_images/images";
import { hashDirectory } from "@/scripts/helper_images/context";
import { EXPECTED_IMAGES } from "@/scripts/helper_images/expected_tags";
import { computeImage, describeMismatch } from "@/scripts/helper_images/tags";

describe("helper images", () => {
  test("isHelperImageName recognizes supported helper images", () => {
    expect(isHelperImageName("morcus-proxy")).toBe(true);
    expect(isHelperImageName("morcus-latincy")).toBe(true);
    expect(isHelperImageName("morcus-pruner")).toBe(true);
    expect(isHelperImageName("unknown-image")).toBe(false);
    expect(ALL_HELPER_IMAGE_NAMES).toEqual(Object.keys(HELPER_IMAGES));
  });

  describe("expected_tags.ts", () => {
    // Deliberately not a Jest snapshot: changing an image (and redeploying it)
    // must be an explicit edit to `expected_tags.ts`, not `jest -u`.
    test.each(ALL_HELPER_IMAGE_NAMES)(
      "%s's build context matches its checked-in entry",
      (name) => {
        const mismatch = describeMismatch(
          name,
          computeImage(name),
          EXPECTED_IMAGES[name]
        );
        if (mismatch !== null) {
          throw new Error(mismatch);
        }
      }
    );

    test("describeMismatch explains what changed and what to paste", () => {
      const expected = { files: ["Dockerfile", "a.py"], tag: "tree-old" };
      expect(describeMismatch("morcus-latincy", expected, expected)).toBeNull();

      const message = describeMismatch(
        "morcus-latincy",
        { files: ["Dockerfile", "README.md", "a.py"], tag: "tree-new" },
        expected
      );
      expect(message).toContain("files: + README.md");
      expect(message).toContain("expected tag: tree-old");
      expect(message).toContain("actual tag:   tree-new");
      expect(message).toContain('tag: "tree-new"');
      expect(message).toContain("redeployed on the next main release");

      expect(
        describeMismatch(
          "morcus-latincy",
          { files: ["a.py"], tag: "tree-old" },
          expected
        )
      ).toContain("files: - Dockerfile");
    });
  });

  describe("hashDirectory", () => {
    let dir: string;

    function write(rel: string, content: string): void {
      const full = join(dir, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content);
    }

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "hash-dir-test-"));
      write("Dockerfile", "FROM scratch\n");
      write("app/main.py", "print(1)\n");
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    test("is a deterministic hex digest that ignores timestamps", () => {
      const hash = hashDirectory(dir);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      write("app/main.py", "print(1)\n"); // rewrite, new mtime
      expect(hashDirectory(dir)).toBe(hash);
    });

    test("changes when content, paths, files, or the executable bit change", () => {
      const hash = hashDirectory(dir);

      write("app/main.py", "print(2)\n");
      const contentChanged = hashDirectory(dir);
      expect(contentChanged).not.toBe(hash);

      rmSync(join(dir, "app/main.py"));
      write("app/other.py", "print(2)\n");
      const renamed = hashDirectory(dir);
      expect(renamed).not.toBe(contentChanged);

      write("extra.txt", "");
      const added = hashDirectory(dir);
      expect(added).not.toBe(renamed);

      chmodSync(join(dir, "extra.txt"), 0o755);
      expect(hashDirectory(dir)).not.toBe(added);
    });
  });
});
