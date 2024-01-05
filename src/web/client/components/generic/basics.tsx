import { BoxWidth, getWidth } from "@/web/client/styling/styles";
import type { RefObject, CSSProperties, PropsWithChildren } from "react";

export interface ContainerProps {
  maxWidth?: BoxWidth;
  disableGutters?: boolean;
  gutterSize?: number;
  style?: CSSProperties;
  innerRef?: RefObject<HTMLDivElement>;
  id?: string;
  className?: string;
}

export function Container(props: PropsWithChildren<ContainerProps>) {
  const extraClass = props.className ? ` ${props.className}` : "";
  const gutterSize = props.disableGutters ? 0 : props.gutterSize;
  return (
    <div
      id={props.id}
      ref={props.innerRef}
      className={"Container" + extraClass}
      style={{
        width: "100%",
        maxWidth: props.maxWidth ? `${getWidth(props.maxWidth)}px` : "100%",
        paddingLeft: gutterSize,
        paddingRight: gutterSize,
        ...props.style,
      }}>
      {props.children}
    </div>
  );
}

export function Divider(props?: { style?: CSSProperties }) {
  return <hr className="contentDivider" style={props?.style} />;
}

export function SpanLink(
  props: PropsWithChildren<{
    onClick: () => any;
    className?: string;
    id: string;
  }>
) {
  return (
    <span
      id={props.id}
      className={props.className}
      onClick={props.onClick}
      onKeyUp={(e) => {
        if (e.key === "Enter") {
          props.onClick();
        }
      }}
      tabIndex={0}
      aria-labelledby={props.id}
      role="link">
      {props.children}
    </span>
  );
}

export function SpanButton(
  props: PropsWithChildren<{ onClick: () => any; className?: string }>
) {
  return (
    <span
      className={props.className}
      onClick={props.onClick}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          props.onClick();
        }
      }}
      tabIndex={0}
      role="button">
      {props.children}
    </span>
  );
}
