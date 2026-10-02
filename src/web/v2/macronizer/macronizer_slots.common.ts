/**
 * The `/v2/macronizer` contract shared by the server renderer
 * (`macronizer_view.server.ts`, `macronizer_params.server.ts`) and the client
 * element (`macronizer_view.client.ts`): slot names, the input limit and
 * document titles, so the two sides can't drift.
 */

export const MACRONIZER_SLOTS = ["macronizer-workspace"] as const;

/**
 * The most characters one Macronize request accepts, counting a line break
 * as one character (as the textarea's `maxlength` does).
 */
export const MACRONIZER_MAX_CHARS = 10000;

export function formatMacronizerPageTitle(hasResult: boolean): string {
  return hasResult
    ? "Macronizer Results | Morcus Latin Tools"
    : "Latin Macronizer | Morcus Latin Tools";
}
