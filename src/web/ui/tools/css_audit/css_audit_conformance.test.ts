/**
 * Conformance check for UI V2 stylesheets (see `css_audit.ts`).
 *
 * Two zero-baseline invariants:
 * 1. No declaration across `critical.css + app.css` is dead because a later
 *    rule with the same selector, context and importance (and at least the same
 *    specificity) resets it. For a same-sheet finding, delete the earlier dead
 *    declaration; for a `critical.css` declaration shadowed by `app.css`,
 *    `critical.css` owns the above-the-fold rule so delete the duplicate in
 *    `app.css`.
 * 2. Every class, `data-*` attribute and `morcus-*` element named in CSS is
 *    referenced from non-test TypeScript source.
 *
 * ALLOWLIST ENTRIES REQUIRE HUMAN REVIEW. Do not add one to make this test
 * pass: delete the dead/duplicate declaration, or write the class name as a
 * literal. If a genuine exception is needed, ask a human and leave a comment
 * at the site explaining why.
 */

import * as path from "path";
import {
  runCssAudit,
  type CssAuditResult,
} from "@/web/ui/tools/css_audit/css_audit";
import { formatShadowFinding } from "@/web/ui/tools/css_audit/css_audit_shadowing";
import { formatCssName } from "@/web/ui/tools/css_audit/css_audit_unreferenced";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

describe("UI V2 CSS audit", () => {
  let result: CssAuditResult;

  beforeAll(() => {
    result = runCssAudit(REPO_ROOT);
  });

  it("has no dead shadowed declarations", () => {
    const report = result.shadowed.map(formatShadowFinding).join("\n\n");
    if (result.shadowed.length > 0) {
      throw new Error(
        `${result.shadowed.length} declaration(s) can never apply because a ` +
          `later rule on the same selector resets them. Delete the dead ` +
          `earlier declaration (or, when app.css duplicates a rule owned by ` +
          `inlined critical.css, delete the later app.css duplicate):\n\n${report}`
      );
    }
    expect(result.staleShadowAllowlist).toEqual([]);
  });

  it("has no unreferenced class, data-attribute or custom-element names", () => {
    const { unreferenced, staleAllowlist } = result.unreferenced;
    if (unreferenced.length > 0) {
      throw new Error(
        `${unreferenced.length} CSS name(s) are not referenced from any ` +
          `non-test .ts file under src/ (tracked or untracked). Delete the ` +
          `rules, or write the name as a literal in the renderer:\n\n` +
          unreferenced.map(formatCssName).join("\n")
      );
    }
    expect(staleAllowlist).toEqual([]);
  });
});
