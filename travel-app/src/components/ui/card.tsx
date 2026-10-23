import type { HTMLAttributes } from "react";

type SurfaceProps = HTMLAttributes<HTMLDivElement>;

function surface(className: string, props: SurfaceProps) {
  const classes = [className, props.className].filter(Boolean).join(" ");
  return { ...props, className: classes };
}

export function Card({ className = "", ...props }: SurfaceProps) {
  return <section {...surface("ui-card", { ...props, className })} />;
}

export function CardHeader({ className = "", ...props }: SurfaceProps) {
  return <div {...surface("ui-card__header", { ...props, className })} />;
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={["ui-card__title", className].filter(Boolean).join(" ")} />;
}

export function CardDescription({ className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={["ui-card__description", className].filter(Boolean).join(" ")} />;
}

export function CardContent({ className = "", ...props }: SurfaceProps) {
  return <div {...surface("ui-card__content", { ...props, className })} />;
}

export function CardFooter({ className = "", ...props }: SurfaceProps) {
  return <footer {...surface("ui-card__footer", { ...props, className })} />;
}
