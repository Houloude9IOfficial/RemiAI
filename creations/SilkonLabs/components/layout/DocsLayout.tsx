'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logomark } from '@/components/ui/Logomark';
import { docsNav } from '@/data/docs';

const docsSections = [
  { id: 'getting-started', title: 'Getting Started', children: [
    { id: 'introduction', title: 'Introduction', href: '/docs' },
    { id: 'quickstart', title: 'Quickstart', href: '/docs/quickstart' },
    { id: 'models', title: 'Models Overview', href: '/docs/models' },
  ]},
  { id: 'api-reference', title: 'API Reference', children: [
    { id: 'authentication', title: 'Authentication', href: '/docs/authentication' },
    { id: 'chat', title: 'Chat Completions', href: '/docs/api/chat' },
    { id: 'completions', title: 'Completions', href: '/docs/api/completions' },
    { id: 'models', title: 'List Models', href: '/docs/api/models' },
    { id: 'rate-limits', title: 'Rate Limits', href: '/docs/rate-limits' },
    { id: 'errors', title: 'Error Codes', href: '/docs/errors' },
  ]},
  { id: 'sdks', title: 'SDKs & Tools', children: [
    { id: 'python', title: 'Python SDK', href: '/docs/python' },
    { id: 'javascript', title: 'JavaScript SDK', href: '/docs/javascript' },
    { id: 'cli', title: 'CLI', href: '/docs/cli' },
  ]},
  { id: 'guides', title: 'Guides', children: [
    { id: 'prompting', title: 'Prompting Best Practices', href: '/docs/guides/prompting' },
    { id: 'fine-tuning', title: 'Fine-tuning', href: '/docs/guides/fine-tuning' },
    { id: 'embeddings', title: 'Embeddings', href: '/docs/guides/embeddings' },
  ]},
];

interface DocsSidebarProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile sidebar toggle */}
      <button
        className="md:hidden fixed top-16 left-4 z-50 btn btn-ghost"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-canvas border-r border-hairline flex flex-col transition-transform duration-200 ease-signature ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-6 border-b border-hairline">
          <Logomark size="md" />
        </div>

        <nav className="flex-1 overflow-y-auto p-4" aria-label="Documentation">
          {docsSections.map((section) => (
            <div key={section.id} className="mb-6">
              <h3 className="text-caption font-medium text-ink-muted uppercase tracking-wider mb-3 px-3">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.children.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-body-sm transition-colors duration-fast ease-signature ${
                        pathname === item.href
                          ? 'bg-surface-2 text-ink font-medium'
                          : 'text-ink-muted hover:text-ink hover:bg-surface-1'
                      }`}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-hairline">
          <Link href="/waitlist" className="btn btn-primary w-full justify-center">
            Get API Access
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 md:ml-0 lg:ml-72">
        <div className="lg:pl-12">
          {children}
        </div>
      </main>
    </div>
  );
}