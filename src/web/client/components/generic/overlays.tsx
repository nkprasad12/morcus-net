import { CSSProperties, PropsWithChildren } from "react";

export interface OverlayProps {
  className?: string;
  style?: CSSProperties;
}

export interface DrawerProps {
  anchor: "left";
  open: boolean;
  onClose: () => any;
  transitionDuration?: number;
  contentProps?: OverlayProps;
}

export function Drawer(props: PropsWithChildren<DrawerProps>) {
  if (props.open !== true) {
    return null;
  }
  const classes = ["contentHolder"].concat(props.contentProps?.className || []);
  return (
    <div className="drawer">
      <div className={classes.join(" ")}>{props.children}</div>
      <div className="overlay" onClick={props.onClose} />
    </div>
  );
}
