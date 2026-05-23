import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";

export function AppLink({
  app,
  children,
  className,
}: {
  app: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to="/dashboard/app/$appName"
      params={{ appName: encodeURIComponent(app) }}
      className={
        className ??
        "hover:text-primary hover:underline underline-offset-4 transition-colors"
      }
    >
      {children ?? app}
    </Link>
  );
}
