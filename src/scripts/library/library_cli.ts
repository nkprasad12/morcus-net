/**
 * `./morcus.sh library <action>`: tools for inspecting the library (reader)
 * pipeline and the TEI corpus it is built from.
 *
 * Each action is one entry in `LIBRARY_ACTIONS`: it declares its own flags on
 * its own sub-parser and runs from the parsed arguments. To add an action,
 * add an entry to the registry; `run_morcus.ts` needs no change.
 */

import type { ArgumentParser } from "argparse";

/** Parsed arguments, as argparse produces them (snake_case keys). */
export type LibraryArgs = Record<string, unknown>;

/** A string flag's value, or `undefined` if it was not passed. */
export function optString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** An integer flag's value, or `undefined` if it was not passed. */
export function optInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export interface LibraryAction {
  /** The action's name on the command line. */
  name: string;
  /** One-line help shown by `./morcus.sh library --help`. */
  help: string;
  /** Adds the action's flags to its sub-parser. */
  configure: (parser: ArgumentParser) => void;
  /** Runs the action. Resolves to `false` on failure (non-zero exit). */
  run: (args: LibraryArgs) => Promise<boolean>;
}

export const LIBRARY_ACTIONS: LibraryAction[] = [
  {
    name: "survey",
    help:
      "Surveys every Perseus Latin TEI file: V1 status, markup census, " +
      "header facts and per-work fingerprints. Writes .cache/library-survey/<label>/.",
    configure: (parser) => {
      parser.add_argument("--root", {
        help: "The canonical-latinLit checkout to survey (default: $LIB_XML_ROOT).",
      });
      parser.add_argument("--label", {
        help: "Output label (default: <latinLit short sha>-<morcus-net short sha>).",
      });
      parser.add_argument("--out", {
        help: "Output directory root (default: .cache/library-survey).",
      });
      parser.add_argument("--write-snapshot", {
        help: "Also write src/common/library/audit/{census_snapshot,manifest}.json.",
        action: "store_true",
      });
      parser.add_argument("--only", {
        help: "Survey only work ids containing this substring (for debugging).",
      });
    },
    run: async (args) => {
      const { runSurveyCli } = await import("@/scripts/library/survey_cli");
      return runSurveyCli({
        root: optString(args.root),
        label: optString(args.label),
        out: optString(args.out),
        writeSnapshot: Boolean(args.write_snapshot),
        only: optString(args.only),
      });
    },
  },
  {
    name: "render",
    help:
      "Renders every onboarded Perseus work through the reader pipeline and " +
      "writes each page's HTML to .cache/library-render/<label>/.",
    configure: (parser) => {
      parser.add_argument("--label", {
        help: "Output label (default: <latinLit short sha>-<morcus-net short sha>).",
      });
      parser.add_argument("--works", {
        help: "Comma-separated work ids to (re-)render into the label (default: all).",
      });
      parser.add_argument("--include-candidates", {
        help: "Also render non-onboarded Latin works in --root that pass processTei2.",
        action: "store_true",
      });
      parser.add_argument("--root", {
        help: "The canonical-latinLit checkout to render (default: $LIB_XML_ROOT).",
      });
      parser.add_argument("--out", {
        help: "Output directory root (default: .cache/library-render).",
      });
    },
    run: async (args) => {
      const { runRenderCli, parseWorkList } = await import(
        "@/scripts/library/render"
      );
      return runRenderCli({
        label: optString(args.label),
        works: parseWorkList(optString(args.works)),
        includeCandidates: Boolean(args.include_candidates),
        root: optString(args.root),
        out: optString(args.out),
      });
    },
  },
  {
    name: "diff",
    help:
      "Compares two renders (library render labels): pages added, removed and " +
      "changed, with an HTML-aware summary. Exits non-zero if they differ.",
    configure: (parser) => {
      parser.add_argument("--from", {
        help: "Baseline label.",
        required: true,
      });
      parser.add_argument("--to", {
        help: "Label to compare.",
        required: true,
      });
      parser.add_argument("--out", {
        help: "Render root (default: .cache/library-render).",
      });
      parser.add_argument("--allow-diff", {
        help: "Exit 0 even if the renders differ.",
        action: "store_true",
      });
      parser.add_argument("--quiet", {
        help: "Print only the summary, not the whole report.",
        action: "store_true",
      });
    },
    run: async (args) => {
      const { runDiffCli } = await import("@/scripts/library/diff");
      const from = optString(args.from);
      const to = optString(args.to);
      if (from === undefined || to === undefined) {
        console.error("--from and --to are required");
        return false;
      }
      return runDiffCli({
        from,
        to,
        out: optString(args.out),
        allowDiff: Boolean(args.allow_diff),
        quiet: Boolean(args.quiet),
      });
    },
  },
  {
    name: "gallery",
    help:
      "Builds the exemplar review gallery (HTML, Markdown, JSON) across " +
      "Perseus Latin works for markup sign-off and per-work spot-check. " +
      "Writes .cache/library-gallery/<label>/.",
    configure: (parser) => {
      parser.add_argument("--root", {
        help: "The canonical-latinLit checkout (default: $LIB_XML_ROOT).",
      });
      parser.add_argument("--label", {
        help: "Output label (default: <latinLit short sha>-<morcus-net short sha>).",
      });
      parser.add_argument("--out", {
        help: "Output directory root (default: .cache/library-gallery).",
      });
      parser.add_argument("--works", {
        help: "Comma-separated work ids (default: all V1-passing Latin works in LatinWorks, or discovered in --root with --include-candidates).",
      });
      parser.add_argument("--include-candidates", {
        help: "Also include non-onboarded Latin works in --root that pass processTei2.",
        action: "store_true",
      });
      parser.add_argument("--max-examples", {
        help: "Max exemplar passages per markup kind (default: 3).",
        type: "int",
      });
      parser.add_argument("--compare-with", {
        help: "Earlier gallery (label under --out, directory, or gallery.json) to diff against; writes diff.html.",
      });
      parser.add_argument("--delta-from", {
        help:
          "Gallery from before the onboarding (label under --out, directory, or gallery.json). " +
          "Also writes <label>-delta/: only works onboarded now but not then, and the markup kinds only they exercise.",
      });
      parser.add_argument("--before-render", {
        help: "With --compare-with: `library render` output of the earlier pipeline (directory with index.json).",
      });
      parser.add_argument("--after-render", {
        help: "With --compare-with: `library render` output of the current pipeline. With --before-render, drops exemplars on pages byte-identical in both.",
      });
    },
    run: async (args) => {
      const { runGalleryCli } = await import("@/scripts/library/gallery");
      const { parseWorkList } = await import("@/scripts/library/render");
      return runGalleryCli({
        root: optString(args.root),
        label: optString(args.label),
        out: optString(args.out),
        works: parseWorkList(optString(args.works)),
        includeCandidates: Boolean(args.include_candidates),
        maxExamples: optInt(args.max_examples),
        compareWith: optString(args.compare_with),
        deltaFrom: optString(args.delta_from),
        beforeRenderDir: optString(args.before_render),
        afterRenderDir: optString(args.after_render),
      });
    },
  },
  {
    name: "gallery-diff",
    help:
      "Writes diff.html comparing two existing galleries (Before/After Diff " +
      "Inspector) without rebuilding either.",
    configure: (parser) => {
      parser.add_argument("--before", {
        help: "Before gallery (label under --out, directory, or gallery.json).",
        required: true,
      });
      parser.add_argument("--after", {
        help: "After gallery (label under --out, directory, or gallery.json).",
        required: true,
      });
      parser.add_argument("--before-render", {
        help: "`library render` output of the Before pipeline (directory with index.json).",
      });
      parser.add_argument("--after-render", {
        help: "`library render` output of the After pipeline. With --before-render, drops exemplars on pages byte-identical in both.",
      });
      parser.add_argument("--output", {
        help: "Output file (default: diff.html next to the After gallery.json).",
      });
      parser.add_argument("--out", {
        help: "Gallery output root for labels (default: .cache/library-gallery).",
      });
    },
    run: async (args) => {
      const { runGalleryDiffCli } = await import("@/scripts/library/gallery");
      return runGalleryDiffCli({
        before: String(args.before),
        after: String(args.after),
        beforeRenderDir: optString(args.before_render),
        afterRenderDir: optString(args.after_render),
        output: optString(args.output),
        out: optString(args.out),
      });
    },
  },
];

/** Name of the parsed-args key that holds the chosen library action. */
export const LIBRARY_ACTION_DEST = "library_action";

/**
 * Adds one sub-parser per registered action to `library`. `extra` is applied
 * to each action parser (e.g. run_morcus's common `--bun` / `--node` flags).
 */
export function configureLibraryParser(
  library: ArgumentParser,
  extra?: (parser: ArgumentParser) => void
): void {
  const actions = library.add_subparsers({
    title: "Library actions",
    dest: LIBRARY_ACTION_DEST,
    required: true,
  });
  for (const action of LIBRARY_ACTIONS) {
    const parser = actions.add_parser(action.name, { help: action.help });
    action.configure(parser);
    extra?.(parser);
  }
}

export async function runLibraryCli(args: LibraryArgs): Promise<boolean> {
  const name = args[LIBRARY_ACTION_DEST];
  const action = LIBRARY_ACTIONS.find((a) => a.name === name);
  if (action === undefined) {
    console.error(`Unknown library action '${String(name)}'`);
    return false;
  }
  return action.run(args);
}
