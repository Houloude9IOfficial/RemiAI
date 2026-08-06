'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DocsLayout } from '@/components/layout/DocsLayout';
import { Card, Badge, Button } from '@/components/ui';
import Link from 'next/link';

export default function DocsPage() {
  return (
    <DocsLayout>
      <div className="container py-12 sm:py-16 lg:py-20">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-16"
        >
          <h1 className="text-display-md sm:text-display-lg font-semibold tracking-tight text-ink mb-4">
            Documentation
          </h1>
          <p className="max-w-2xl text-body-lg text-ink-muted">
            Everything you need to integrate Silkon models into your applications. APIs, SDKs, guides, and best practices.
          </p>
        </motion.section>

        {/* Quick Actions */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mb-16"
        >
          <div className="flex flex-wrap gap-4">
            <Badge variant="copper" size="lg" className="cursor-pointer">Get API Key</Badge>
            <Badge variant="steel" size="lg" className="cursor-pointer">View Models</Badge>
            <Badge variant="platinum" size="lg" className="cursor-pointer">Python SDK</Badge>
            <Badge variant="steel" size="lg" className="cursor-pointer">JS SDK</Badge>
          </div>
        </motion.section>

        {/* Sections */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Getting Started',
                description: 'Your first API call in 5 minutes',
                href: '/docs/getting-started',
                icon: '🚀',
                items: ['Quickstart', 'Authentication', 'First Request'],
              },
              {
                title: 'API Reference',
                description: 'Complete endpoint documentation',
                href: '/docs/api',
                icon: '📚',
                items: ['Chat Completions', 'Completions', 'Models', 'Rate Limits'],
              },
              {
                title: 'Models',
                description: 'Capabilities, benchmarks, and specs',
                href: '/docs/models',
                icon: '🧠',
                items: ['Silkon 1T', 'Silkon 7B', 'Silkon 400M'],
              },
              {
                title: 'SDKs',
                description: 'Official client libraries',
                href: '/docs/sdks',
                icon: '📦',
                items: ['Python', 'JavaScript/TypeScript', 'CLI'],
              },
              {
                title: 'Guides',
                description: 'Best practices and tutorials',
                href: '/docs/guides',
                icon: '📖',
                items: ['Prompting', 'Fine-tuning', 'Embeddings'],
              },
              {
                title: 'Changelog',
                description: 'API updates and new features',
                href: '/docs/changelog',
                icon: '📝',
                items: ['v1.0', 'v0.9', 'v0.8'],
              },
            ].map((section, index) => (
              <motion.article
                key={section.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Card variant="interactive" padding="lg" className="h-full">
                  <Link href={section.href} className="flex flex-col h-full text-decoration-none">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-3xl">{section.icon}</span>
                      <h3 className="text-card-title font-medium text-ink">{section.title}</h3>
                    </div>
                    <p className="text-body text-ink-muted flex-1 mb-4">{section.description}</p>
                    <ul className="space-y-1.5">
                      {section.items.map((item) => (
                        <li key={item} className="text-body-sm text-ink-subtle flex gap-2">
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-copper mt-2" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </Link>
                </Card>
              </motion.article>
            ))}
          </div>
        </motion.section>
      </div>
    </DocsLayout>
  );
}