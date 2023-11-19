import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import React, { useContext } from "react";
import { Solarized } from "@/web/client/colors";
import {
  GlobalBooleans,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";

function GlobalSettingsCheckbox(props: {
  label: string;
  settingKey: keyof GlobalBooleans;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const enabled = globalSettings.data[props.settingKey] === true;

  return (
    <div>
      <input
        id={props.label}
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          const newSettings = { ...globalSettings.data };
          newSettings[props.settingKey] = e.currentTarget.checked;
          globalSettings.setData(newSettings);
        }}
      />
      <label htmlFor={props.label} style={{ paddingLeft: 8 }}>
        {props.label}
      </label>
    </div>
  );
}

export function SiteSettings() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ padding: 3 }}>
        <Typography component={"div"} color={Solarized.base00}>
          <GlobalSettingsCheckbox
            label="Enable Experimental Settings"
            settingKey="experimentalMode"
          />
          <GlobalSettingsCheckbox label="Dark Mode" settingKey="darkMode" />
        </Typography>
      </Box>
    </Container>
  );
}
