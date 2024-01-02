import { CSSProperties } from "react";

export function Divider(props?: { style?: CSSProperties }) {
  return <hr className="contentDivider" style={props?.style} />;
}
