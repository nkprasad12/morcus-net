// Component manifest for UI V2 Custom Elements.
//
// Importing this module executes registerElement() for all V2 custom elements,
// across every route chunk. Production pages never load it: they load only
// their route's entry chunks (`common.js`, `dict.js`, `reader.js`,
// `external.js`, `corpus.js`). Conformance harnesses
// (`reattach_conformance.test.ts`, `ssr_conformance.test.ts`,
// `route_bundle_conformance.test.ts`) import it to register every element in
// jsdom.
//
// It used to be side-effect-free with respect to global window/document event
// listeners, which is what made it safe to import in tests. Because it now
// imports the entries, it also pulls in the modules that install global
// listeners at import time (anchor scroll, back-to-top, mobile menu, deferred
// iframes, the abbreviation popover). Restoring that property is tracked in
// CODE_HEALTH.md.
import "@/web/v2/shell/common_entry.client";
import "@/web/v2/dict/dict_entry.client";
import "@/web/v2/reader/reader_entry.client";
import "@/web/v2/external/external_entry.client";
import "@/web/v2/corpus/corpus_entry.client";
