import { BoxWidth, getWidth } from "@/web/client/styling/styles";
import type {
  RefObject,
  CSSProperties,
  PropsWithChildren,
  AriaAttributes,
} from "react";

export namespace AriaProps {
  export function extract<T extends AriaAttributes>(input: T): AriaAttributes {
    const result: AriaAttributes = {};
    for (const key in input) {
      if (key.startsWith("aria-")) {
        // @ts-ignore
        result[key] = input[key];
      }
    }
    return result;
  }
}

export interface CoreProps extends AriaAttributes {
  style?: CSSProperties;
  id?: string;
  className?: string;
  onClick?: () => any;
}

export interface ContainerProps extends CoreProps {
  maxWidth?: BoxWidth;
  disableGutters?: boolean;
  gutterSize?: number;
  innerRef?: RefObject<HTMLDivElement>;
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

export interface ButtonLikeProps {
  onClick: React.EventHandler<any>;
  onKeyUp: React.KeyboardEventHandler<any>;
  tabIndex: number;
}
export function buttonLikeProps(
  onClick: React.EventHandler<any>,
  triggerOnSpace: boolean = false
): ButtonLikeProps {
  return {
    tabIndex: 0,
    onClick: onClick,
    onKeyUp: (e) => {
      if (e.key === "Enter" || (triggerOnSpace && e.key === " ")) {
        onClick(e);
      }
    },
  };
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
      {...buttonLikeProps(props.onClick)}
      aria-labelledby={props.id}
      role="link">
      {props.children}
    </span>
  );
}

export function SpanButton(
  props: PropsWithChildren<{
    onClick: () => any;
    className?: string;
    style?: CSSProperties;
  }>
) {
  return (
    <span
      className={props.className}
      style={{ cursor: "pointer", ...props.style }}
      {...buttonLikeProps(props.onClick, true)}
      role="button">
      {props.children}
    </span>
  );
}

export function TextField(props: {
  id?: string;
  styles?: CSSProperties;
  value?: string;
  onNewValue?: (value: string) => any;
  placeholder?: string;
  fullWidth?: boolean;
  multiline?: boolean;
  minRows?: number;
  autoFocus?: boolean;
  defaultValue?: string;
}) {
  const onNewValue = props.onNewValue;
  const onChange =
    onNewValue === undefined
      ? undefined
      : (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onNewValue(e.target.value);
  const width = "calc(100% - 12px)";
  const baseProps = {
    id: props.id,
    className: "text md textField",
    spellCheck: false,
    autoCapitalize: "none",
    autoComplete: "off",
    defaultValue: props.defaultValue,
    autoFocus: props.autoFocus,
    rows: props.minRows,
    value: props.value,
    onChange,
    placeholder: props.placeholder,
    style: {
      ...(props.fullWidth ? { width, maxWidth: width } : {}),
      ...props.styles,
    },
  };

  return props.multiline ? (
    <textarea {...baseProps} />
  ) : (
    <input type="text" {...baseProps} />
  );
}
