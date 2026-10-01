// Entry for `corpus.js` (`dependOn: "common"`), loaded only on /v2/corpus.
import "@/web/v2/corpus/corpus_view.client";
// The only production import of the autocomplete (corpus/README.md, "Autocomplete boundary"), so
// it can move into a lazy sub-chunk by changing this line alone.
import "@/web/v2/corpus/corpus_autocomplete.client";
