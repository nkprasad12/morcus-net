/* istanbul ignore file */

import {
  DEFAULT_OPEN_TEXTS_CATALOG_PATH,
  buildOpenTextsCatalog,
} from "@/common/open_texts/catalog_builder";

function main(): void {
  const outputPath = process.argv[2] || DEFAULT_OPEN_TEXTS_CATALOG_PATH;
  const bundle = buildOpenTextsCatalog(outputPath);
  const plCount = bundle.entries.filter(
    (e) => e.source === "patrologia_latina"
  ).length;
  const llCount = bundle.entries.filter(
    (e) => e.source === "thelatinlibrary"
  ).length;
  console.log(
    `[open-texts] Wrote ${bundle.entries.length} catalog entries ` +
      `(Patrologia Latina: ${plCount}, The Latin Library: ${llCount}) to ${outputPath}`
  );
}

if (require.main === module) {
  main();
}
