export namespace Workers {
  export const MACRONIZER = "MACRONIZER";
  export const LS_DICT = "LS_DICT";

  export type Category = typeof MACRONIZER | typeof LS_DICT;

  export function isValid(workerType: string): workerType is Category {
    return [MACRONIZER, LS_DICT].includes(workerType);
  }
}
