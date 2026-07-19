"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query-client";
import { StreamingProvider } from "@/lib/chat/streaming-context";
import { NotificationListener } from "@/components/NotificationListener";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <StreamingProvider>
          <TooltipProvider>
            <NotificationListener />
            {children}
            <Toaster />
          </TooltipProvider>
        </StreamingProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
