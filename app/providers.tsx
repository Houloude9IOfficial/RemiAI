"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { AccentColorProvider } from "@/components/AccentColorProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/lib/query-client";
import { StreamingProvider } from "@/lib/chat/streaming-context";
import { NotificationListener } from "@/components/NotificationListener";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthWall } from "@/components/auth/AuthWall";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryProvider>
          <StreamingProvider>
            <TooltipProvider>
              <NotificationListener />
              <AuthWall>
                <AccentColorProvider>{children}</AccentColorProvider>
              </AuthWall>
              <Toaster />
            </TooltipProvider>
          </StreamingProvider>
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
