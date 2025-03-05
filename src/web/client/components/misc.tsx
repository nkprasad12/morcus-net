export function SelfLink(props: { to: string; nohttps?: true }) {
  const prefix = props.nohttps ? "" : "https://";
  return (
    <a href={prefix + props.to} style={{ wordBreak: "break-all" }}>
      {props.to}
    </a>
  );
}
