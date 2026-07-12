import { ReactNode } from 'react';

export default function CenteredLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
      <div className="w-full max-w-3xl">{children}</div>
    </div>
  );
}