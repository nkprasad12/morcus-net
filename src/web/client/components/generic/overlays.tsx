import { CSSProperties, PropsWithChildren } from "react";

export interface OverlayProps {
  className?: string;
  style?: CSSProperties;
}

interface ModalProps {
  open: boolean;
  onClose: () => any;
  contentProps?: OverlayProps;
}

export interface DrawerProps extends ModalProps {
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
      <div className="modalOverlay" onClick={props.onClose} />
    </div>
  );
}
