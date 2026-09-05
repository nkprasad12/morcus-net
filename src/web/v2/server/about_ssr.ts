import * as he from "he";
import { renderPageShell } from "@/web/v2/server/page_shell";

export interface AboutPageOptions {
  commitId?: string;
}

export function renderAboutContentHtml(options: AboutPageOptions = {}): string {
  const commitId = options.commitId ?? process.env.COMMIT_ID;
  const commitLinkHtml =
    commitId && commitId.length > 0
      ? `<a href="https://github.com/nkprasad12/morcus-net/commit/${he.encode(
          commitId
        )}">${he.encode(commitId.slice(0, 7))}</a>`
      : "<span>(dev build)</span>";

  return `
    <article class="v2-about-article">
      <header class="v2-header">
        <h1>About M&oacute;rcus</h1>
        <p>A free digital toolkit for Latin learners and scholars.</p>
      </header>

      <section id="site" class="v2-about-section">
        <h2>Site</h2>
        <p>
          This website is a free collection of resources for Latin learners. It is provided under the
          <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>
          license. Source code is available on
          <a href="https://github.com/nkprasad12/morcus-net" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
        <p>Comments, contributions, or feature requests are welcome by any of the following methods:</p>
        <ul>
          <li>Opening an issue on the <a href="https://github.com/nkprasad12/morcus-net/issues" target="_blank" rel="noopener noreferrer">GitHub repository</a></li>
          <li>Asking for M&oacute;rcus on the <a href="https://discord.gg/latin" target="_blank" rel="noopener noreferrer">Latin Discord</a></li>
        </ul>
      </section>

      <section id="dictionary" class="v2-about-section">
        <h2>Dictionary</h2>
        <p>
          Dictionary data is derived from Perseus' digitization of Lewis &amp; Short, which is available
          <a href="https://github.com/PerseusDL/lexica" target="_blank" rel="noopener noreferrer">here</a>.
          Perseus generously provides this data under the
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
          license. During deployment, this site pulls from a
          <a href="https://github.com/nkprasad12/lexica" target="_blank" rel="noopener noreferrer">fork</a>
          of the Perseus repo, to which we make changes and corrections which are eventually merged upstream.
        </p>
      </section>

      <section id="acknowledgements" class="v2-about-section">
        <h2>Acknowledgements</h2>
        <p>
          This site is indebted to the
          <a href="https://www.perseus.tufts.edu/hopper/" target="_blank" rel="noopener noreferrer">Perseus project</a>
          for sharing their painstakingly digitized documents &mdash; this site would not simply be possible
          if not for their commitment to free and open access.
        </p>
        <div>
          <p>A special thank you to the following contributors:</p>
          <ul>
            <li><strong>Quillful</strong>: for so many useful suggestions of features and UX improvements touching on virtually every aspect of the site; for many contributions in improving the accuracy of morphological analysis; for reporting countless typos in the dictionaries and library texts.</li>
            <li><strong>Remus</strong>: for adding title handling in the dictionary; for all the helpful feedback on the dictionary presentation; for all the typo reports.</li>
            <li><strong>Aemilia, Emilia, and Quintus</strong>: for typo reports and various feedback on early versions of the dictionary.</li>
            <li><strong>Cantulus, Davus, and Quillful</strong>: for transcribing many Hebrew and Punic words that were omitted in Perseus' original transcription of Lewis and Short.</li>
          </ul>
        </div>
      </section>

      <section id="debugging" class="v2-about-section">
        <h2>Debugging</h2>
        <p>Commit: ${commitLinkHtml}</p>
      </section>
    </article>
  `;
}

/**
 * Renders the full standalone About page document with App Bar.
 */
export function renderAboutPageHtml(options: AboutPageOptions = {}): string {
  const contentHtml = renderAboutContentHtml(options);
  return renderPageShell({
    title: "About - Morcus Latin Tools",
    activePage: "about",
    contentHtml,
  });
}
