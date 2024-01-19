import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { useContext } from "react";
import {
  GlobalBooleans,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { Container } from "@/web/client/components/generic/basics";

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
        <Typography component={"div"} className="nonDictText">
          <GlobalSettingsCheckbox
            label="Enable Experimental features"
            settingKey="experimentalMode"
          />
        </Typography>
      </Box>
    </Container>
  );
}
