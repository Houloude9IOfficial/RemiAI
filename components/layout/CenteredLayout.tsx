import { ReactNode } from 'react';

export default function CenteredLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-start justify-center">
      <div className="min-w-0 w-full max-w-3xl">{children}</div>
    </div>
  );
}
