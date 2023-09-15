import React from "react";

export function SelfLink(props: { to: string }) {
  return (
    <a href={props.to} style={{ wordBreak: "break-all" }}>
      {props.to}
    </a>
  );
}
