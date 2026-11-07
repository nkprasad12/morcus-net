import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
    expect(isHelperImageName("morcus-watchtower")).toBe(true);
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

  describe("Node version pins", () => {
    function parseDockerfileNodeRefs(path: string): string[] {
      const refs = Array.from(
        readFileSync(path, "utf8").matchAll(/^FROM\s+(node:\S+)/gm),
        (m) => m[1]
      );
      expect(refs.length).toBeGreaterThan(0);
      return refs;
    }

    function getRecordField(obj: unknown, key: string): unknown {
      return typeof obj === "object" && obj !== null && key in obj
        ? Reflect.get(obj, key)
        : undefined;
    }

    test("Dockerfile, pruner Dockerfile, .nvmrc, workflows, and package.json agree on Node versions", () => {
      const serverRefs = parseDockerfileNodeRefs("Dockerfile");
      const prunerRefs = parseDockerfileNodeRefs(
        "src/devops/pruner/Dockerfile"
      );
      // Every stage in /Dockerfile and /src/devops/pruner/Dockerfile must pin
      // the exact same `node:<major>-...@sha256:...` base image.
      const uniqueRefs = new Set([...serverRefs, ...prunerRefs]);
      if (uniqueRefs.size !== 1) {
        throw new Error(
          `Dockerfile and src/devops/pruner/Dockerfile must pin the exact same Node base image, found: ${[
            ...uniqueRefs,
          ].join(", ")}`
        );
      }
      const [nodeRef] = uniqueRefs;
      const majorMatch = /^node:(\d+)-[^@]+@sha256:[0-9a-f]{64}$/.exec(nodeRef);
      if (!majorMatch) {
        throw new Error(
          `Expected Node base image pinned as node:<major>-<variant>@sha256:<digest>, got: ${nodeRef}`
        );
      }
      const dockerMajor = Number(majorMatch[1]);
      const nvmrc = readFileSync(".nvmrc", "utf8").trim();

      if (nvmrc !== String(dockerMajor)) {
        throw new Error(
          [
            `Node major version mismatch between Dockerfiles and .nvmrc:`,
            `  Dockerfile / pruner Dockerfile: ${nodeRef}`,
            `  .nvmrc:                         ${JSON.stringify(
              nvmrc
            )} (expected "${dockerMajor}")`,
            `When Dependabot bumps the Node major version, verify the new major is Active LTS and update .nvmrc to match.`,
          ].join("\n")
        );
      }

      // CI workflows must read `.nvmrc` so GitHub Actions runs the same Node
      // major as the production and helper Docker images.
      for (const workflow of [
        ".github/workflows/ci-workflow.yaml",
        ".github/workflows/promote-image.yaml",
      ]) {
        const content = readFileSync(workflow, "utf8");
        expect(content).toContain("node-version-file: .nvmrc");
        expect(content).not.toContain("node-version-file: package.json");
      }

      // `package.json` (`engines.node` + `@types/node`) sets the minimum local
      // dev version (e.g. Cloudtop `/usr/bin/node`) and must not exceed the
      // production Docker major.
      const pkg: unknown = JSON.parse(readFileSync("package.json", "utf8"));
      const engineNode = getRecordField(getRecordField(pkg, "engines"), "node");
      const typesNode = getRecordField(
        getRecordField(pkg, "devDependencies"),
        "@types/node"
      );
      const engineMatch =
        typeof engineNode === "string"
          ? /^(?:>=|\^)?(\d+)(?:\.x)?$/.exec(engineNode)
          : null;
      const typesMatch =
        typeof typesNode === "string" ? /^\^?(\d+)\./.exec(typesNode) : null;
      expect(engineMatch).not.toBeNull();
      expect(typesMatch).not.toBeNull();
      expect(Number(engineMatch![1])).toBeLessThanOrEqual(dockerMajor);
      expect(Number(typesMatch![1])).toBeLessThanOrEqual(dockerMajor);
    });
  });

  describe("nginx version pin", () => {
    test("the reverse proxy pins an nginx Stable (even minor) release by digest", () => {
      const dockerfile = readFileSync(
        "src/devops/reverse_proxy/Dockerfile",
        "utf8"
      );
      const refs = Array.from(
        dockerfile.matchAll(/^FROM\s+(nginx:\S+)/gm),
        (m) => m[1]
      );
      expect(refs).toHaveLength(1);
      const match =
        /^nginx:1\.(\d+)\.\d+-alpine-slim@sha256:[0-9a-f]{64}$/.exec(refs[0]);
      if (match === null) {
        throw new Error(
          `Expected nginx:1.<minor>.<patch>-alpine-slim@sha256:<digest>, got: ${refs[0]}`
        );
      }
      const minor = Number(match[1]);
      if (minor % 2 !== 0) {
        throw new Error(
          [
            `${refs[0]} is an nginx Mainline release (odd minor version).`,
            `The reverse proxy stays on nginx Stable (even minor versions): use the`,
            `latest 1.${
              minor - 1
            }.x, and add "1.${minor}.x" to the nginx ignore list`,
            `in .github/dependabot.yml if it's missing.`,
          ].join("\n")
        );
      }
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
