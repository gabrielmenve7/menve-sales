import { cn } from "@/lib/utils";

/** Selects do pipeline / automações — alinhado a `pipeline-view.tsx`. */
export const pipelineSelectClass = cn(
  "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export const pipelineFieldSelectClass = cn(
  "min-w-[13.5rem] shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm shadow-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);
