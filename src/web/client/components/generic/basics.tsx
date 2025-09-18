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
}

export function extractCoreProps(coreProps: CoreProps) {
  const ariaProps = AriaProps.extract(coreProps);
  return {
    ...ariaProps,
    style: coreProps.style,
    id: coreProps.id,
    className: coreProps.className,
  };
}

export interface ClickableCoreProps extends CoreProps {
  onClick?: () => unknown;
}

export interface ContainerProps extends ClickableCoreProps {
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
    onClick: () => unknown;
    onAuxClick?: () => unknown;
    className?: string;
    id: string;
  }>
) {
  return (
    <span
      id={props.id}
      className={props.className}
      onAuxClick={props.onAuxClick}
      {...buttonLikeProps(props.onClick)}
      aria-labelledby={props.id}
      role="link">
      {props.children}
    </span>
  );
}

export function SpanButton(
  props: PropsWithChildren<{
    onAuxClick?: () => unknown;
    onClick: () => unknown;
    className?: string;
    style?: CSSProperties;
  }>
) {
  return (
    <span
      className={props.className}
      onAuxClick={props.onAuxClick}
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
  onNewValue?: (value: string) => unknown;
  placeholder?: string;
  fullWidth?: boolean;
  multiline?: boolean;
  minRows?: number;
  autoFocus?: boolean;
  defaultValue?: string;
  size?: "sm" | "md" | "lg";
}) {
  const onNewValue = props.onNewValue;
  const onChange =
    onNewValue === undefined
      ? undefined
      : (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onNewValue(e.currentTarget.value);
  const baseProps = {
    id: props.id,
    className: `text ${props.size ?? "md"} textField`,
    spellcheck: false,
    autoCapitalize: "none",
    autoComplete: "off",
    defaultValue: props.defaultValue,
    autoFocus: props.autoFocus,
    rows: props.minRows,
    onChange,
    placeholder: props.placeholder,
    style: {
      ...(props.fullWidth ? { width: "100%" } : {}),
      ...props.styles,
    },
  } as const;

  return props.multiline ? (
    <textarea {...baseProps} />
  ) : (
    <input type="text" {...baseProps} />
  );
}

export interface CheckBoxProps extends CoreProps {
  label: string;
  enabled: boolean;
  onNewValue: (value: boolean) => unknown;
}

export function CheckBox(props: CheckBoxProps) {
  return (
    <div {...extractCoreProps(props)}>
      <input
        id={props.label}
        type="checkbox"
        checked={props.enabled}
        onChange={(e) => props.onNewValue(e.currentTarget.checked)}
      />
      <label htmlFor={props.label} style={{ paddingLeft: 8 }}>
        {props.label}
      </label>
    </div>
  );
}
