import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import React from "react";
import { Solarized } from "../colors";
import { getCommitHash } from "../define_vars";

export function About() {
  const commitHash = getCommitHash();

  return (
    <Container maxWidth="lg">
      <Box sx={{ padding: 3 }}>
        <Typography component={"div"} color={Solarized.base00}>
          <section>
            <h4>Site</h4>
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
          </section>
          <section>
            <h4>Dictionary</h4>
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
          </section>
          <section>
            <h4>Acknowledgements</h4>
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
          </section>
          <h4>Debugging</h4>
          <section>
            <p>
              Built at{" "}
              <a
                href={`https://github.com/nkprasad12/morcus-net/commit/${commitHash}`}
              >
                {commitHash.substring(0, 8)}
              </a>
              {"."}
            </p>
          </section>
        </Typography>
      </Box>
    </Container>
  );
}
