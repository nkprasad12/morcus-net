import { assertEqual } from "@/common/assert";

const PRODELISION_VARIANTS = /[’‘`]/g;
const PRODELISION_SPLITER = "'";
const ENCLITICS = ["que", "ne", "ve", "ue", "met", "cum", "dum"];

function splitProdelision(token: string): string[][] {
  if (token.includes(PRODELISION_SPLITER)) {
    const parts = token.split(PRODELISION_SPLITER);
    assertEqual(parts.length, 2);
    if (parts[0].length === 0) {
      return [["e" + parts[1]]];
    }
    return [[parts[0], "e" + parts[1]]];
  }
  if (token.endsWith("ust")) {
    // TODO(morcus): Do we ever have -u + est?
    return [[token], [token.substring(0, token.length - 1), "est"]];
  }
  if (token.endsWith("st")) {
    return [[token], [token.substring(0, token.length - 2), "est"]];
  }
  /* ...ist could be from either i+est (usual) or is+est (3rd decl genitives esp),
   and ...ost could be from os+est (old nominative) or o+st */
  return [[token]];
}

function splitExtras(token: string): string[][] {
  const prodelisionParts = splitProdelision(token);
  return prodelisionParts.flatMap((variant) => {
    const splitVariants: string[][] = [variant];
    for (const enclitic of ENCLITICS) {
      const encliticSplit: string[] = [];
      for (const chunk of variant) {
        if (
          chunk.endsWith(enclitic) &&
          !(enclitic === "ue" && chunk.endsWith("que"))
        ) {
          encliticSplit.push(
            chunk.substring(0, chunk.length - enclitic.length),
            enclitic
          );
        } else {
          encliticSplit.push(chunk);
        }
      }
      if (encliticSplit.length > variant.length) {
        splitVariants.push(encliticSplit);
      }
    }
    return splitVariants;
  });
}

function normalize(token: string): string {
  return token.trim().replaceAll(PRODELISION_VARIANTS, PRODELISION_SPLITER);
}

export function decomposeToken(token: string): string[][] {
  return splitExtras(normalize(token));
}
