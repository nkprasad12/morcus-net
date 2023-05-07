import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import React from "react";
import { Solarized } from "../colors";

export function About() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ padding: 3 }}>
        <Typography component={"div"} color={Solarized.base00}>
          <section>
            <h4>Site</h4>
            <span>
              This website is a free collection of resources for Latin learners,
              developed by Mórcus. It is provided under the{" "}
              <a href="https://www.gnu.org/licenses/agpl-3.0.en.html">
                AGPL-3.0
              </a>{" "}
              license; source code is available on{" "}
              <a href="https://github.com/nkprasad12/morcus-net">GitHub</a>.
              Comments, contributions or feature requests are welcome - feel
              free to contact me on GitHub or ask for Mórcus on the{" "}
              <a href="https://discord.gg/latin">Latin Discord</a>. Please
              submit corrections or other issues with dictionary entries through
              the in-app feedback.
            </span>
          </section>
          <section>
            <h4>Dictionary</h4>
            <span>
              Dictionary data is derived from Perseus' digitization of Lewis &
              Short, which is available{" "}
              <a href="https://github.com/PerseusDL/lexica">here</a>. Perseus
              generously provides this data under the{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/">
                CC BY-SA 4.0
              </a>{" "}
              license. During deployment, this site pulls from a{" "}
              <a href="https://github.com/nkprasad12/lexica">fork</a> of the
              Perseus repo, to which I make changes and corrections which are
              eventually merged upstream.
            </span>
          </section>
          <section>
            <h4>Acknowledgements</h4>
            <span>
              I am infinitely grateful to the{" "}
              <a href="https://www.perseus.tufts.edu/hopper/">
                Perseus project
              </a>{" "}
              for sharing their painstakingly digitized documents - this site
              would not simply be possible if not for their commitment to free
              and open access. Thanks also to my friends on the LLPSI and Latin
              Discords who graciously helped and encouraged me on my Latin
              journey, and in particular to Ianthis for their frequent guidance
              and thorough feedback on early versions of the site. Grátiás vóbís
              agó!
            </span>
          </section>
        </Typography>
      </Box>
    </Container>
  );
}
