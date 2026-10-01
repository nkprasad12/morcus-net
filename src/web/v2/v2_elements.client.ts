// Component manifest for UI V2 Custom Elements.
//
// Importing this module executes registerElement() for all V2 custom elements,
// across every route chunk. Production pages never load it: they load only
// their route's entry chunks (`common.js`, `dict.js`, `reader.js`,
// `external.js`, `corpus.js`). Conformance harnesses
// (`reattach_conformance.test.ts`, `testing/ssr_conformance_harness.ts`,
// `testing/interaction_harness.ts`, `route_bundle_conformance.test.ts`) import it to register every element in
// jsdom.
//
// Feature modules have no import-time side effects beyond `registerElement`
// (enforced by `core/boot_conformance.test.ts`); only entries start the
// global setups, via `onPageReady`. This barrel imports the entries, so it
// starts them too: jsdom's document is already `complete`, so the setups
// (anchor scroll, back-to-top, mobile menu, deferred iframes, the
// abbreviation popover) run on import. Tests that need a clean document
// should import the feature module they exercise instead.
import "@/web/v2/shell/common_entry.client";
import "@/web/v2/dict/dict_entry.client";
import "@/web/v2/reader/reader_entry.client";
import "@/web/v2/external/external_entry.client";
import "@/web/v2/corpus/corpus_entry.client";
