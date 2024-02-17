import { SelfLink } from "@/web/client/components/misc";

export function Footer(props: {
  id?: string;
  className?: string;
  marginRatio?: number;
}) {
  return (
    <div style={{ padding: "2em" }} id={props.id} className={props.className}>
      <div
        className="footer text xs compact"
        style={{
          marginTop: window.innerHeight * (props.marginRatio || 1),
          // For the drawer on mobile reader.
          marginBottom: "20px",
        }}>
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
        See <SelfLink to="https://www.gnu.org/licenses/gpl-3.0.en.html" /> for a
        copy of the GNU General Public License.
      </div>
    </div>
  );
}
