"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryProvider>
  );
}
