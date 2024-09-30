import {
  AriaProps,
  SpanButton,
  type CoreProps,
} from "@/web/client/components/generic/basics";
import FocusTrap from "@mui/base/FocusTrap";
import { CSSProperties, PropsWithChildren, useEffect } from "react";

export interface OverlayProps extends CoreProps {
  className?: string;
  style?: CSSProperties;
}

interface ModalProps extends CoreProps {
  open: boolean;
  onClose: () => unknown;
  contentProps?: OverlayProps;
}

function BaseModal(
  props: PropsWithChildren<ModalProps & { className: string }>
) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) {
      return;
    }
    const keyListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keyup", keyListener);
    return () => window.removeEventListener("keyup", keyListener);
  }, [open, onClose]);

  const classes = ["contentHolder"]
    .concat(props.contentProps?.className || [])
    .concat(open ? "open" : []);
  return (
    <FocusTrap open={open}>
      <div
        className={props.className}
        tabIndex={-1}
        {...AriaProps.extract(props)}>
        <div className={classes.join(" ")}>{open && props.children}</div>
        {open && (
          <div className="modalOverlay" onClick={onClose} tabIndex={-1} />
        )}
      </div>
    </FocusTrap>
  );
}

export interface DrawerProps extends ModalProps {}
export function Drawer(props: PropsWithChildren<DrawerProps>) {
  return <BaseModal {...props} className="drawer" />;
}

export interface DialogProps extends ModalProps {}
export function ModalDialog(props: PropsWithChildren<DialogProps>) {
  return <BaseModal {...props} className="dialogModal" />;
}

export interface SimpleModalProps {
  onClose: () => unknown;
  message?: JSX.Element;
}
export function SimpleModal(props: SimpleModalProps) {
  return (
    <ModalDialog
      contentProps={{ className: "bgColor" }}
      open={props.message !== undefined}
      onClose={props.onClose}>
      <div
        id="notificationModalTitle"
        className="text sm"
        style={{ fontWeight: "bold", margin: 0, padding: "12px 12px" }}>
        Offline Mode Enabled
      </div>
      <div style={{ padding: "0px 12px 12px" }} className="text sm">
        {props.message}
      </div>
      <div className="dialogActions">
        <SpanButton
          onClick={props.onClose}
          className="text sm light button simple">
          Close
        </SpanButton>
      </div>
    </ModalDialog>
  );
}
