import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted/80 animate-pulse",
        "motion-reduce:animate-none motion-reduce:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
