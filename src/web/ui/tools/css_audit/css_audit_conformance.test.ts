/**
 * Conformance check for UI V2 stylesheets (see `css_audit.ts`).
 *
 * Two zero-baseline invariants:
 * 1. No declaration is dead because a later rule with the same selector,
 *    context and importance (and at least the same specificity) resets it.
 * 2. Every class, `data-*` attribute and `morcus-*` element named in CSS is
 *    referenced from non-test TypeScript source.
 *
 * ALLOWLIST ENTRIES REQUIRE HUMAN REVIEW. Do not add one to make this test
 * pass: delete the dead declaration, or write the class name as a literal.
 * If a genuine exception is needed, ask a human and leave a comment at the
 * site explaining why.
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
          `later rule on the same selector resets them. Delete them (or move ` +
          `the surviving value next to its owner):\n\n${report}`
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
