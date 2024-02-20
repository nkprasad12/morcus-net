import {
  AriaProps,
  type CoreProps,
} from "@/web/client/components/generic/basics";
import FocusTrap from "@mui/base/FocusTrap";
import { CSSProperties, PropsWithChildren } from "react";

export interface OverlayProps extends CoreProps {
  className?: string;
  style?: CSSProperties;
}

interface ModalProps extends CoreProps {
  open: boolean;
  onClose: () => any;
  contentProps?: OverlayProps;
}

export interface DrawerProps extends ModalProps {
  anchor: "left";
  transitionDuration?: number;
}

export function Drawer(props: PropsWithChildren<DrawerProps>) {
  if (props.open !== true) {
    return null;
  }
  const classes = ["contentHolder"].concat(props.contentProps?.className || []);
  return (
    <FocusTrap open>
      <div className="drawer" tabIndex={-1}>
        <div className={classes.join(" ")}>{props.children}</div>
        <div className="modalOverlay" onClick={props.onClose} />
      </div>
    </FocusTrap>
  );
}

export interface DialogProps extends ModalProps {}
export function ModalDialog(props: PropsWithChildren<DialogProps>) {
  if (props.open !== true) {
    return null;
  }
  const classes = ["contentHolder"].concat(props.contentProps?.className || []);
  return (
    <FocusTrap open>
      <div className="dialogModal" tabIndex={-1} {...AriaProps.extract(props)}>
        <div className={classes.join(" ")}>{props.children}</div>
        <div className="modalOverlay" onClick={props.onClose} />
      </div>
    </FocusTrap>
  );
}
