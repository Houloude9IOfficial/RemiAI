"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TriangleAlertIcon, RotateCcwIcon } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-md w-full border-destructive/20 ring-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlertIcon className="size-5" />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground wrap-break-word">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-muted-foreground/60">
              Error ID: {error.digest}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="gap-1.5"
          >
            <RotateCcwIcon className="size-3.5" />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
