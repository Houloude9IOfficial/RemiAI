'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button, Card, Badge } from '@/components/ui';
import Link from 'next/link';

const silkon1T = {
  name: 'Silkon 1T',
  tagline: '1 trillion parameters. Unified intelligence.',
  description:
    'Silkon 1T is our flagship model, trained on 10 trillion tokens of carefully curated data. It achieves state-of-the-art performance across reasoning, coding, mathematics, and multilingual understanding.',
  status: 'available' as const,
  specs: [
    { label: 'Parameters', value: '1 Trillion', detail: 'Dense Transformer' },
    { label: 'Context Length', value: '128K tokens', detail: '4096 max output' },
    { label: 'Training Data', value: '10T tokens', detail: 'Filtered + deduplicated' },
    { label: 'Architecture', value: 'Dense Transformer', detail: 'RoPE, SwiGLU, RMSNorm' },
    { label: 'Tokenizer', value: '128K vocab', detail: 'Byte-level BPE' },
    { label: 'License', value: 'Research + Commercial', detail: 'Contact for terms' },
  ],
  benchmarks: [
    { task: 'MMLU', score: '87.2', baseline: 'GPT-4: 86.4' },
    { task: 'HumanEval', score: '92.1', baseline: 'GPT-4: 89.0' },
    { task: 'GSM8K', score: '94.8', baseline: 'GPT-4: 92.0' },
    { task: 'MATH', score: '78.3', baseline: 'GPT-4: 76.6' },
    { task: 'HumanEval+', score: '89.5', baseline: 'GPT-4: 85.4' },
    { task: 'MBPP', score: '88.7', baseline: 'GPT-4: 82.0' },
  ],
  capabilities: [
    'Advanced reasoning',
    'Code generation',
    'Multilingual (100+ languages)',
    'Long-context understanding',
    'Mathematical problem solving',
    'Creative writing',
    'Document analysis',
    'Tool use & function calling',
  ],
  useCases: [
    {
      title: 'Research assistants',
      description: 'Accelerate scientific discovery with deep literature understanding and hypothesis generation.',
    },
    {
      title: 'Code review & generation',
      description: 'Production-grade code across 50+ languages with context-aware suggestions.',
    },
    {
      title: 'Enterprise automation',
      description: 'Deploy at scale with consistent quality for document processing, support, and analysis.',
    },
    {
      title: 'Multilingual applications',
      description: 'Native-quality understanding and generation across 100+ languages.',
    },
  ],
};

export default function Silkon1TModelPage() {
  return (
    <main id="main-content" className="min-h-screen">
      {/* Model Hero */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="copper" dot>Flagship</Badge>
              <Badge variant="steel">Available</Badge>
            </div>
            <h1 className="text-display-md sm:text-display-lg lg:text-display-xl font-semibold tracking-tight text-ink">
              {silkon1T.name}
            </h1>
            <p className="text-display-sm sm:text-subhead text-ink-muted max-w-3xl">
              {silkon1T.tagline}
            </p>
            <p className="max-w-3xl text-body-lg text-ink-muted">
              {silkon1T.description}
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Button variant="primary" size="lg" asChild>
                <Link href="/waitlist">Join Waitlist</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/docs/api">Read the API Docs</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Specs */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Specifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {silkon1T.specs.map((spec, index) => (
              <motion.div
                key={spec.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Card variant="default" padding="md">
                  <p className="text-caption text-ink-tertiary">{spec.label}</p>
                  <p className="text-headline font-semibold text-ink mt-1">{spec.value}</p>
                  <p className="text-body-sm text-ink-muted mt-1">{spec.detail}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benchmarks */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Benchmarks</h2>
          <Card variant="default" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-hairline">
                    <th className="px-6 py-4 text-caption font-medium text-ink-muted uppercase tracking-wider">Task</th>
                    <th className="px-6 py-4 text-caption font-medium text-ink-muted uppercase tracking-wider">Silkon 1T</th>
                    <th className="px-6 py-4 text-caption font-medium text-ink-muted uppercase tracking-wider">Baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {silkon1T.benchmarks.map((row, index) => (
                    <motion.tr
                      key={row.task}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.2, delay: index * 0.04 }}
                      className="border-b border-hairline last:border-0 hover:bg-surface-2 transition-colors duration-fast ease-signature"
                    >
                      <td className="px-6 py-4 text-body font-medium text-ink">{row.task}</td>
                      <td className="px-6 py-4 text-body text-brand-copper font-medium">{row.score}</td>
                      <td className="px-6 py-4 text-body text-ink-muted">{row.baseline}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Capabilities</h2>
          <div className="flex flex-wrap gap-2">
            {silkon1T.capabilities.map((capability, index) => (
              <motion.div
                key={capability}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.15, delay: index * 0.03 }}
              >
                <Badge variant="default" size="lg">{capability}</Badge>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Use Cases</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {silkon1T.useCases.map((useCase, index) => (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.06 }}
              >
                <Card variant="interactive" padding="lg">
                  <h3 className="text-card-title font-medium text-ink">{useCase.title}</h3>
                  <p className="text-body text-ink-muted mt-2">{useCase.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <Card variant="elevated" padding="xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <h2 className="text-headline font-semibold text-ink">Ready to build with Silkon 1T?</h2>
                <p className="text-body text-ink-muted mt-2">
                  Join the waitlist for early access and be among the first to deploy frontier AI.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 justify-start sm:justify-end">
                <Button variant="primary" size="lg" asChild>
                  <Link href="/waitlist">Join Waitlist</Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/docs/api">View API Docs</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}