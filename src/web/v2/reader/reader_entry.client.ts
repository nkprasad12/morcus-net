// Entry for `reader.js` (`dependOn: "common"`).
//
// `<morcus-library-view>` lives here rather than in `common.js` or its own
// chunk on purpose: anyone who opens the library goes on to the reader, so
// loading the reader chunk on /library warms the cache for the next page.
import "@/web/v2/reader/reader_view.client";
import "@/web/v2/reader/reader_settings.client";
import "@/web/v2/library/library_view.client";
