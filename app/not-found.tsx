import Link from "next/link";
import { ArrowLeftIcon, CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none"
      />

      <section className="relative w-full max-w-lg text-center">

        <p className="font-mono text-sm font-medium tracking-[0.3em] text-primary">
          ERROR 404
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted-foreground">
          The page you’re looking for doesn’t exist, has moved, or may have
          wandered off into another conversation.
        </p>
      </section>
    </div>
  );
}
