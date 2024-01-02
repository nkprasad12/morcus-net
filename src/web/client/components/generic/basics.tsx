import { BoxWidth, getWidth } from "@/web/client/styles";
import type { RefObject, CSSProperties, PropsWithChildren } from "react";

export interface ContainerProps {
  maxWidth?: BoxWidth;
  disableGutters?: boolean;
  style?: CSSProperties;
  innerRef?: RefObject<HTMLDivElement>;
  id?: string;
  className?: string;
}

export function Container(props: PropsWithChildren<ContainerProps>) {
  const extraClass = props.className ? ` ${props.className}` : "";
  return (
    <div
      id={props.id}
      ref={props.innerRef}
      className={"Container" + extraClass}
      style={{
        width: "100%",
        maxWidth: props.maxWidth ? `${getWidth(props.maxWidth)}px` : "100%",
        paddingLeft: props.disableGutters ? 0 : undefined,
        paddingRight: props.disableGutters ? 0 : undefined,
        ...props.style,
      }}>
      {props.children}
    </div>
  );
}

export function Divider(props?: { style?: CSSProperties }) {
  return <hr className="contentDivider" style={props?.style} />;
}
