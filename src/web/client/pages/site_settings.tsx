import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import React, { useContext } from "react";
import { Solarized } from "@/web/client/colors";
import {
  GlobalSettings,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { checkSatisfies } from "@/common/assert";
import { isBoolean } from "@/web/utils/rpc/parsing";

function GlobalSettingsCheckbox(props: {
  label: string;
  settingKey: keyof GlobalSettings;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const settingValue = checkSatisfies(
    globalSettings.data[props.settingKey],
    isBoolean
  );
  const enabled = settingValue === true;

  return (
    <div>
      <input
        id={props.label}
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          const newSettings = { ...globalSettings.data };
          // @ts-ignore - we checked above that this is a boolean field.
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
        </Typography>
      </Box>
    </Container>
  );
}
