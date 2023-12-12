import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { SelfLink } from "@/web/client/components/misc";

export function Footer(props: { id?: string; className?: string }) {
  return (
    <Box padding="2em" id={props.id} className={props.className}>
      <Typography
        component={"div"}
        className="footer"
        style={{ marginTop: window.innerHeight }}
        fontSize={12}>
        <p>
          This program is free software: you can redistribute it and/or modify
          it under the terms of the GNU General Public License as published by
          the Free Software Foundation, either version 3 of the License, or (at
          your option) any later version.
        </p>
        <p>
          This program is distributed in the hope that it will be useful, but
          WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
          General Public License for more details.
        </p>
        See <SelfLink to="https://www.gnu.org/licenses/gpl-3.0.en.html" />
        for a copy of the GNU General Public License.
      </Typography>
    </Box>
  );
}
