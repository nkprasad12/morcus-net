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
