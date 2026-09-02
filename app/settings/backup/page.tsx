// This page is loaded client-only via next/dynamic to avoid hydration
// mismatches from @base-ui/react's SSR handling of `disabled` attributes
// (the server strips it, the client adds it back).
"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import CenteredLayout from "@/components/layout/CenteredLayout";

const BackupContent = dynamic(() => import("./BackupContent"), {
  ssr: false,
  loading: () => (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    </CenteredLayout>
  ),
});

export default function BackupPage() {
  return <BackupContent />;
}
