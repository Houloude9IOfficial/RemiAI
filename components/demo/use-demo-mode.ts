"use client";

import { useEffect, useState } from "react";

export function useDemoMode() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { demo?: boolean }) => setDemo(data.demo === true))
      .catch(() => undefined);
  }, []);

  return demo;
}
