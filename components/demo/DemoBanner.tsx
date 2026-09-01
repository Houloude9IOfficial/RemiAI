"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function DemoBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { demo?: boolean }) => setDemo(data.demo === true))
      .catch(() => undefined);
  }, []);

  if (!demo) return null;

  return (
    <div className="shrink-0 border-b border-primary/20 bg-primary/10 px-4 py-2 text-center text-xs text-foreground">
      <strong>Very limited public demo:</strong> this showcase includes only a small part of RemiAI. The full app is fully open source and includes many more features. {" "}
      <Link
        href="https://github.com/Houloude9IOfficial/RemiAI"
        target="_blank"
        rel="noreferrer"
        className="font-medium underline underline-offset-2 hover:text-primary"
      >
        Explore the source code
      </Link>
      .
    </div>
  );
}
