import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import React, { useContext } from "react";
import { Solarized } from "@/web/client/colors";
import { getCommitHash } from "@/web/client/define_vars";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";

const INSTALL_GUIDE =
  "https://www.cdc.gov/niosh/mining/content/hearingloss/installPWA.html";

type SectionProps = React.PropsWithChildren<{ name: string }>;

function Section(props: SectionProps) {
  return (
    <section id={props.name.replace(" ", "-")}>
      <h4>
        <a
          style={{ textDecoration: "none", color: "inherit" }}
          href={`#${props.name}`}
        >
          {props.name}
        </a>
      </h4>
      {props.children}
    </section>
  );
}

export function About() {
  const globalSettings = useContext(GlobalSettingsContext);

  const experimentalMode = globalSettings.data.experimentalMode === true;
  const commitHash = getCommitHash();

  return (
    <Container maxWidth="lg">
      <Box sx={{ padding: 3 }}>
        <Typography component={"div"} color={Solarized.base00}>
          <Section name="Site">
            <p>
              This website is a free collection of resources for Latin learners,
              developed by Mórcus. It is provided under the{" "}
              <a href="https://www.gnu.org/licenses/agpl-3.0.en.html">
                AGPL-3.0
              </a>{" "}
              license; source code is available on{" "}
              <a href="https://github.com/nkprasad12/morcus-net">GitHub</a>.
            </p>
            <p>
              Comments, contributions or feature requests are welcome - feel
              free to contact me on GitHub or ask for Mórcus on the{" "}
              <a href="https://discord.gg/latin">Latin Discord</a>. Please
              submit corrections or other issues with dictionary entries by
              clicking on the flag icon in the top navigation bar.
            </p>
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
              Perseus repo, to which I make changes and corrections which are
              eventually merged upstream.
            </p>
          </Section>
          <Section name="Acknowledgements">
            <p>
              I am ever grateful to the{" "}
              <a href="https://www.perseus.tufts.edu/hopper/">
                Perseus project
              </a>{" "}
              for sharing their painstakingly digitized documents - this site
              would not simply be possible if not for their commitment to free
              and open access.
            </p>
            <p>
              Shoutouts also to my friends on the LLPSI and Latin Discords who
              have graciously helped and encouraged me, both on my Latin journey
              and in making this site - thanks to Aemilia, Emilia, Quintus, and
              Remus for their feedback on early versions of the dictionary.
              Special thanks to Quillful for being my guide to the (initially)
              murky world of Digital Classics, for the long ideation
              converstions, and for the thorough feedback and many great ideas
              on improving the user interface. Grátiás vóbís agó!
            </p>
          </Section>
          <Section name="Installation">
            <p>
              morcus.net is also installable as a standalone app (meaning that
              it will come with its own launcher icon, will not have clutter
              from the browser search bar, will have some light extra theming,
              and so on).
            </p>
            <p>
              Android users can get the app directly from the{" "}
              <a href="https://play.google.com/store/apps/details?id=net.morcus.pwa">
                Play Store
              </a>
              . Otherwise, see instructions for{" "}
              <a href={`${INSTALL_GUIDE}#InstallingaPWAonAndroid`}>Android</a>
              {" (without Play Store), "}
              <a href={`${INSTALL_GUIDE}#InstallingaPWAoniOS`}>iOS</a>
              {", or "}
              <a href={`${INSTALL_GUIDE}#InstallingaPWAonaWindowsPCorMac`}>
                desktop
              </a>
              .
            </p>
          </Section>
          <Section name="Debugging">
            <p>
              Built at{" "}
              <a
                href={`https://github.com/nkprasad12/morcus-net/commit/${commitHash}`}
              >
                {commitHash.substring(0, 8)}
              </a>
              {"."}
            </p>
            <div>
              <input
                id="enableExperimentalToggle"
                type="checkbox"
                checked={experimentalMode}
                onChange={(e) =>
                  globalSettings.setData({
                    ...globalSettings.data,
                    experimentalMode: e.currentTarget.checked,
                  })
                }
              />
              <label
                htmlFor="enableExperimentalToggle"
                style={{ paddingLeft: 8 }}
              >
                Enable Experimental Features
              </label>
            </div>
          </Section>
        </Typography>
      </Box>
    </Container>
  );
}
