/**
 * Conformance check for page-level startup (CHUNK_ORDERING.md, decision A+D).
 *
 * Invariant: global setups run only once every chunk on the page has
 * executed, never at import time. A page loads `common.js` and then its route
 * chunk; code that runs when `common.js` executes sees a page whose route
 * components have not upgraded yet, so it must not read their state or take
 * over native behaviour.
 *
 * Enforced here:
 * 1. No `*.client.ts` module has import-time side effects other than
 *    `registerElement(...)`. Entry files (`*_entry.client.ts`) may also call
 *    `onPageReady(...)`, and nothing else may.
 * 2. Every global setup (`export const setupX = createSingletonSetup(...)`)
 *    is started from an `onPageReady` callback in some entry file, so a new
 *    setup can't be exported and forgotten.
 *
 * Related guards: `page_shell.test.ts` (chunk tags are non-`async` modules,
 * which DOMContentLoaded waits for) and the activation gate in
 * `core/js_gate.client.ts` (`canHandleActivation`) for handlers.
 */

import fs from "fs";
import path from "path";
import ts from "typescript";

const V2_ROOT = path.resolve(__dirname, "..");

function clientFiles(dir: string = V2_ROOT): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...clientFiles(full));
    } else if (entry.name.endsWith(".client.ts")) {
      out.push(full);
    }
  }
  return out;
}

const isEntry = (file: string) => file.endsWith("_entry.client.ts");
const rel = (file: string) => path.relative(V2_ROOT, file);

/**
 * The inline `<head>` script (bundled separately as `critical.js`, not a
 * chunk). It must run synchronously before first paint and only touches
 * `<html>`, so it is its own entry by design.
 */
const INLINE_HEAD_SCRIPT = "shell/critical_theme.client.ts";

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
}

function calleeName(expr: ts.Expression): string | undefined {
  if (!ts.isCallExpression(expr)) return undefined;
  return ts.isIdentifier(expr.expression) ? expr.expression.text : undefined;
}

const DECLARATION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ImportDeclaration,
  ts.SyntaxKind.ImportEqualsDeclaration,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.EmptyStatement,
]);

/** Top-level statements of `sf` that run code with effects at import. */
function importTimeEffects(sf: ts.SourceFile, entry: boolean): string[] {
  const allowedCalls = new Set(
    entry ? ["registerElement", "onPageReady"] : ["registerElement"]
  );
  const problems: string[] = [];
  for (const stmt of sf.statements) {
    if (DECLARATION_KINDS.has(stmt.kind)) continue;
    const line = sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
    const text = stmt.getText().split("\n")[0];
    if (ts.isExpressionStatement(stmt)) {
      const name = calleeName(stmt.expression);
      if (name !== undefined && allowedCalls.has(name)) continue;
      problems.push(`${rel(sf.fileName)}:${line}: ${text}`);
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      // Initializers are not proven pure, but starting a setup or queueing
      // page-ready work from a declaration is the pattern this guards.
      for (const decl of stmt.declarationList.declarations) {
        const name = decl.initializer && calleeName(decl.initializer);
        if (name && (/^setup[A-Z]/.test(name) || name === "onPageReady")) {
          problems.push(`${rel(sf.fileName)}:${line}: ${text}`);
        }
      }
      continue;
    }
    // `if (typeof document !== "undefined") setupX()` and friends.
    problems.push(`${rel(sf.fileName)}:${line}: ${text}`);
  }
  return problems;
}

/** `export const setupX = createSingletonSetup(...)` names in `sf`. */
function exportedSetups(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.initializer &&
        calleeName(decl.initializer) === "createSingletonSetup"
      ) {
        names.push(decl.name.text);
      }
    }
  }
  return names;
}

/** Identifiers called inside `onPageReady(...)` callbacks in `sf`. */
function bootedSetups(sf: ts.SourceFile): Set<string> {
  const booted = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      booted.add(node.expression.text);
    }
    ts.forEachChild(node, collect);
  };
  for (const stmt of sf.statements) {
    if (
      ts.isExpressionStatement(stmt) &&
      calleeName(stmt.expression) === "onPageReady"
    ) {
      collect(stmt.expression);
    }
  }
  return booted;
}

describe("page startup conformance", () => {
  const files = clientFiles();
  const sources = new Map(files.map((f) => [f, parse(f)]));

  test("finds the client modules and entries", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter(isEntry).length).toBeGreaterThanOrEqual(5);
  });

  test("no client module has import-time side effects beyond registerElement", () => {
    const problems = files
      .filter((f) => rel(f) !== INLINE_HEAD_SCRIPT)
      .flatMap((f) => importTimeEffects(sources.get(f)!, isEntry(f)));
    expect(problems).toEqual([]);
  });

  test("onPageReady is called only from entry files", () => {
    const callers = files.filter((f) => {
      if (isEntry(f) || f.endsWith("page_ready.client.ts")) return false;
      let found = false;
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "onPageReady"
        ) {
          found = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(sources.get(f)!);
      return found;
    });
    expect(callers.map(rel)).toEqual([]);
  });

  test("every global setup is started from onPageReady in an entry", () => {
    const booted = new Set<string>();
    for (const f of files.filter(isEntry)) {
      for (const name of bootedSetups(sources.get(f)!)) booted.add(name);
    }
    const setups = files.flatMap((f) =>
      exportedSetups(sources.get(f)!).map((name) => ({ name, file: rel(f) }))
    );
    expect(setups.length).toBeGreaterThan(0);
    const notBooted = setups.filter(({ name }) => !booted.has(name));
    expect(notBooted).toEqual([]);
  });

  test("the checker flags an import-time setup", () => {
    const sf = ts.createSourceFile(
      "fake.client.ts",
      `export const setupX = createSingletonSetup(() => () => {});\n` +
        `if (typeof document !== "undefined") {\n  setupX();\n}\n` +
        `setupX();\n` +
        `registerElement("a-b", class {});\n`,
      ts.ScriptTarget.Latest,
      true
    );
    expect(importTimeEffects(sf, false)).toHaveLength(2);
    expect(importTimeEffects(sf, true)).toHaveLength(2);
  });
});

/** Dynamic `import(...)` calls in `sf`, as `file:line` strings. */
function dynamicImports(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      out.push(where(sf, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** `async onConnect()` method declarations in `sf`. */
function asyncOnConnects(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText(sf) === "onConnect" &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      out.push(where(sf, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Augmentations of the global `HTMLElementTagNameMap` in `sf`. */
function globalTagMapAugmentations(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === "HTMLElementTagNameMap"
    ) {
      out.push(where(sf, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * Imports (value or type) of a `Morcus*` identifier from another module.
 * Type imports count too: a peer's class type is how its methods get called,
 * so the only typed path to it is `MorcusElementTagNameMap` via
 * `queryUpgraded` / `closestUpgraded`, which check that the peer is running.
 */
function morcusClassImports(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    const names: string[] = [];
    if (clause.name) names.push(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        names.push((el.propertyName ?? el.name).text);
      }
    }
    for (const name of names) {
      if (/^Morcus[A-Z]/.test(name)) {
        out.push(`${where(sf, stmt)} ${name}`);
      }
    }
  }
  return out;
}

function where(sf: ts.SourceFile, node: ts.Node): string {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${rel(sf.fileName)}:${line + 1}`;
}

/**
 * Rules the activation gate in `LifetimeScope.listen` relies on (see
 * `canHandleActivation` in `core/js_gate.client.ts`).
 */
describe("activation gate conformance", () => {
  const files = clientFiles();
  const sources = files.map(parse);

  test("no lazy import(): activation into a not-yet-defined element is blocked", () => {
    // Lazy loading needs a gate design: the gate treats an element whose
    // definition hasn't arrived as not running, so a control that lazily
    // imports its target on first click would be skipped.
    expect(sources.flatMap(dynamicImports)).toEqual([]);
  });

  test("onConnect is synchronous, so data-upgraded means behaviour is attached", () => {
    expect(sources.flatMap(asyncOnConnects)).toEqual([]);
  });

  test("component tags augment MorcusElementTagNameMap, not HTMLElementTagNameMap", () => {
    // Otherwise raw querySelector("morcus-x") returns the class type even
    // when the element hasn't upgraded; use queryUpgraded / closestUpgraded.
    expect(sources.flatMap(globalTagMapAugmentations)).toEqual([]);
  });

  test("no client module imports another module's Morcus* class", () => {
    // Reach peers through queryUpgraded / closestUpgraded, so their methods
    // are only called once they run. For annotations, let the type be
    // inferred from those, or name `MorcusElementTagNameMap["morcus-x"]`.
    expect(sources.flatMap(morcusClassImports)).toEqual([]);
  });

  test("the checkers flag violations", () => {
    const sf = ts.createSourceFile(
      path.join(V2_ROOT, "fake.client.ts"),
      `import { MorcusA, type MorcusB } from "./a";\n` +
        `import type { MorcusC } from "./c";\n` +
        `declare global { interface HTMLElementTagNameMap { "x-y": X } }\n` +
        `class X { async onConnect() { await import("./z"); } }\n`,
      ts.ScriptTarget.Latest,
      true
    );
    expect(morcusClassImports(sf)).toEqual([
      "fake.client.ts:1 MorcusA",
      "fake.client.ts:1 MorcusB",
      "fake.client.ts:2 MorcusC",
    ]);
    expect(globalTagMapAugmentations(sf)).toEqual(["fake.client.ts:3"]);
    expect(asyncOnConnects(sf)).toEqual(["fake.client.ts:4"]);
    expect(dynamicImports(sf)).toEqual(["fake.client.ts:4"]);
  });
});
