import type { ComponentPropsWithRef } from "react";
import clsx from "clsx";
import { registerStyles } from "../../shadow-styles";
import css from "./IconButton.css?inline";

// Register css to shadow-dom
registerStyles(css);

// Native button Properties with Omit: ("aria-label" | "children")
type NativeButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "aria-label" | "children"
>;

// Combining with custom properties
type IconButtonProps = NativeButtonProps & {
  children: React.ReactNode;
  ariaLabel: string;
};

function IconButton({
  className,
  children,
  ariaLabel,
  type = "button",
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={clsx("icon-button", className)}
      aria-label={ariaLabel}
      ref={ref}
      {...props}
    >
      <span className="icon-button-icon" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}

export default IconButton;
