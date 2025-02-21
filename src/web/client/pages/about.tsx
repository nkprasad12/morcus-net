import * as React from "react";
import { getCommitHash } from "@/web/client/define_vars";
import { Container } from "@/web/client/components/generic/basics";

const INSTALL_GUIDE = "https://www.cdc.gov/niosh/mining/tools/installpwa.html";

type SectionProps = React.PropsWithChildren<{ name: string }>;

function Section(props: SectionProps) {
  return (
    <section id={props.name.replace(" ", "-")}>
      <h4>
        <a
          style={{ textDecoration: "none", color: "inherit" }}
          href={`#${props.name}`}>
          {props.name}
        </a>
      </h4>
      {props.children}
    </section>
  );
}

export function About() {
  const commitHash = getCommitHash() ?? "undefined";

  return (
    <Container maxWidth="lg">
      <div style={{ padding: "24px" }}>
        <div className="nonDictText text md">
          <Section name="Site">
            <p>
              This website is a free collection of resources for Latin learners.
              It is provided under the{" "}
              <a href="https://www.gnu.org/licenses/gpl-3.0.en.html">GPL-3.0</a>{" "}
              license. Source code is available on{" "}
              <a href="https://github.com/nkprasad12/morcus-net">GitHub</a>.
            </p>
            <p>
              Comments, contributions or feature requests are welcome by any of
              the following methods:
            </p>
            <ul>
              <li>clicking on the flag icon in the top navigation bar</li>
              <li>opening an issue on the GitHub repo</li>
              <li>
                asking for Mórcus on the{" "}
                <a href="https://discord.gg/latin">Latin Discord</a>
              </li>
            </ul>
          </Section>
          <Section name="Dictionary">
            <p>
              Dictionary data is derived from Perseus&apos; digitization of
              Lewis & Short, which is available{" "}
              <a href="https://github.com/PerseusDL/lexica">here</a>. Perseus
              generously provides this data under the{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/">
                CC BY-SA 4.0
              </a>{" "}
              license. During deployment, this site pulls from a{" "}
              <a href="https://github.com/nkprasad12/lexica">fork</a> of the
              Perseus repo, to which we make changes and corrections which are
              eventually merged upstream.
            </p>
          </Section>
          <Section name="Acknowledgements">
            <p>
              This site is indebted to the{" "}
              <a href="https://www.perseus.tufts.edu/hopper/">
                Perseus project
              </a>{" "}
              for sharing their painstakingly digitized documents - this site
              would not simply be possible if not for their commitment to free
              and open access.
            </p>
            <div>
              A special thank you to the following
              <ul>
                <li>
                  Quillful: for so many useful suggestions of features and UX
                  improvements touching on virtually every aspect of the site;
                  for many contributions in improving the accuracy of the
                  Morphological analysis; for reporting countless typos in the
                  dictionaries and library texts.
                </li>
                <li>
                  Remus: for adding title handling in the dictionary; for all
                  the helpful feedback on the dictionary presentation; for all
                  the typo reports.
                </li>
                <li>
                  Aemilia, Emilia and Quintus: for typo reports and various
                  feedback on early versions of the dictionary.
                </li>
                <li>
                  Cantulus, Davus, and Quillful: transcribing many Hebrew and
                  Punic words that were omitted in Perseus&apos; original
                  transcription of Lewis and Short.
                </li>
              </ul>
            </div>
          </Section>
          <Section name="Installation">
            <p>
              Morcus Latin Tools is also installable as an app. See instructions
              for <a href={INSTALL_GUIDE}>Android, iOS, and desktop</a>.
            </p>
          </Section>
          <Section name="Debugging">
            <p>
              Built at{" "}
              <a
                href={`https://github.com/nkprasad12/morcus-net/commit/${commitHash}`}>
                {commitHash.substring(0, 8)}
              </a>
              {"."}
            </p>
          </Section>
        </div>
      </div>
    </Container>
  );
}
