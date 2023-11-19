import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import React, { useContext } from "react";
import { Solarized } from "@/web/client/colors";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";

export function SiteSettings() {
  const globalSettings = useContext(GlobalSettingsContext);

  const experimentalMode = globalSettings.data.experimentalMode === true;

  return (
    <Container maxWidth="lg">
      <Box sx={{ padding: 3 }}>
        <Typography component={"div"} color={Solarized.base00}>
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
        </Typography>
      </Box>
    </Container>
  );
}
