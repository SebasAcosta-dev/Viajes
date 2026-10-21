import type { HTMLAttributes } from "react";

export type BadgeVariant = "neutral" | "brand" | "success" | "warning" | "danger";

export function Badge({
  variant = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      {...props}
      className={["ui-badge", `ui-badge--${variant}`, className].filter(Boolean).join(" ")}
    />
  );
}
