import {
  AriaProps,
  type ClickableCoreProps,
} from "@/web/client/components/generic/basics";
import { PropsWithChildren, useEffect, useRef } from "react";

export type OverlayProps = ClickableCoreProps;

interface ModalProps extends ClickableCoreProps {
  open: boolean;
  onClose: () => unknown;
  contentProps?: OverlayProps;
}

interface BaseDialogProps extends ClickableCoreProps {
  open: boolean;
  onClose: () => unknown;
  className: string;
  contentProps?: OverlayProps;
}

export function BaseDialog(props: PropsWithChildren<BaseDialogProps>) {
  const { open, onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const classes = [props.className]
    .concat(props.contentProps?.className || [])
    .join(" ");
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

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      onClick={onClose}
      className={classes}
      {...AriaProps.extract(props)}>
      <div onClick={(e) => e.stopPropagation()} role="presentation">
        {props.children}
      </div>
    </dialog>
  );
}

export type DrawerProps = ModalProps;
export function Drawer(props: PropsWithChildren<DrawerProps>) {
  return <BaseDialog {...props} className="drawer" />;
}

export type DialogProps = ModalProps;
export function ModalDialog(props: PropsWithChildren<DialogProps>) {
  return <BaseDialog {...props} className="dialogModal" />;
}
