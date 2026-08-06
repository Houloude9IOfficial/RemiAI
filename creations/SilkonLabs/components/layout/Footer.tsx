'use client';

import React from 'react';
import Link from 'next/link';
import { Logomark } from '@/components/ui/Logomark';

const footerNav = {
  product: [
    { label: 'Models', href: '/models' },
    { label: 'Research', href: '/research' },
    { label: 'Docs', href: '/docs' },
    { label: 'API', href: '/docs/api' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ],
  legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Security', href: '/security' },
  ],
  social: [
    { label: 'Twitter', href: 'https://twitter.com/silkonlabs', external: true },
    { label: 'GitHub', href: 'https://github.com/silkonlabs', external: true },
    { label: 'Discord', href: 'https://discord.gg/silkonlabs', external: true },
  ],
};

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-hairline bg-canvas">
      <div className="container py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-4">
              <Logomark size="md" />
            </Link>
            <p className="text-body-sm text-ink-subtle max-w-xs">
              Building the silicon foundation for AGI. Frontier AI models for the next era of intelligence.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-caption font-medium text-ink-muted uppercase tracking-wider mb-3">
              Product
            </h3>
            <ul className="space-y-2">
              {footerNav.product.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-body-sm text-ink-subtle hover:text-ink transition-colors duration-fast ease-signature"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-caption font-medium text-ink-muted uppercase tracking-wider mb-3">
              Company
            </h3>
            <ul className="space-y-2">
              {footerNav.company.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-body-sm text-ink-subtle hover:text-ink transition-colors duration-fast ease-signature"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal + Social */}
          <div>
            <h3 className="text-caption font-medium text-ink-muted uppercase tracking-wider mb-3">
              Legal
            </h3>
            <ul className="space-y-2">
              {footerNav.legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-body-sm text-ink-subtle hover:text-ink transition-colors duration-fast ease-signature"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <h3 className="text-caption font-medium text-ink-muted uppercase tracking-wider mt-6 mb-3">
              Connect
            </h3>
            <div className="flex gap-3">
              {footerNav.social.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink-subtle hover:text-ink transition-colors duration-fast ease-signature"
                  aria-label={item.label}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                >
                  <span className="text-body-sm">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-hairline flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-caption text-ink-tertiary">
            © {currentYear} Silkon Labs. All rights reserved.
          </p>
          <p className="text-caption text-ink-tertiary">
            Building the silicon foundation for AGI
          </p>
        </div>
      </div>
    </footer>
  );
}