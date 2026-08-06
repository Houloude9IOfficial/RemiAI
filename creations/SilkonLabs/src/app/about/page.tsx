'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge } from '@/components/ui';
import Link from 'next/link';

const values = [
  { title: 'Rigor first', description: 'Every claim is backed by measurement. We ship models that are reproducible and verifiable.' },
  { title: 'Open science', description: 'We publish benchmarks, training details, and model cards so the community can build on our work.' },
  { title: 'Scalable design', description: 'From 400M to 1T parameters, the same architecture principles apply. Consistency compounds.' },
  { title: 'Responsible development', description: 'Safety evaluations, red-teaming, and bias audits are part of every release pipeline.' },
];

const team = [
  { name: 'Alex Chen', role: 'Chief Executive Officer', bio: 'Former research lead at DeepMind. PhD in machine learning from MIT.' },
  { name: 'Maya Patel', role: 'Chief Technology Officer', bio: 'Built distributed training infrastructure at Meta AI. Stanford CS.' },
  { name: 'Jonas Müller', role: 'Head of Research', bio: '15+ years in NLP and transformer architectures. Former Google Brain.' },
  { name: 'Sarah Kim', role: 'Head of Engineering', bio: 'Scaled inference platforms to 100M+ users. ex-Amazon AWS.' },
];

const milestones = [
  { year: '2023', event: 'Silkon Labs founded with a focus on dense transformer efficiency.' },
  { year: '2024', event: 'Silkon 7B released. Open-weight model adopted by 10K+ developers.' },
  { year: '2025', event: 'Silkon 1T training completed. State-of-the-art on 6 major benchmarks.' },
  { year: '2026', event: 'Expanded to 100+ languages. Enterprise API launched.' },
];

export default function AboutPage() {
  return (
    <main id="main-content" className="min-h-screen">
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="flex flex-col gap-6">
            <h1 className="text-display-md sm:text-display-lg lg:text-display-xl font-semibold tracking-tight text-ink">
              About Silkon Labs
            </h1>
            <p className="max-w-2xl text-body-lg text-ink-muted">
              We&apos;re a team of researchers and engineers building the silicon foundation for AGI — one rigorous experiment at a time.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-display-sm font-semibold text-ink mb-4">Mission</h2>
              <p className="text-body-lg text-ink-muted">
                Artificial intelligence should be powerful, accessible, and grounded in rigorous science. At Silkon Labs, we build models that reason, explain, and scale — without shortcuts.
              </p>
            </div>
            <div>
              <h2 className="text-display-sm font-semibold text-ink mb-4">Values</h2>
              <div className="flex flex-col gap-4">
                {values.map((value, index) => (
                  <motion.div
                    key={value.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.2, delay: index * 0.06 }}
                  >
                    <Card variant="default" padding="lg">
                      <h3 className="text-card-title font-medium text-ink">{value.title}</h3>
                      <p className="text-body text-ink-muted mt-1">{value.description}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Leadership</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((member, index) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.06 }}
              >
                <Card variant="default" padding="lg" className="h-full">
                  <div className="flex flex-col gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-copper flex items-center justify-center text-white font-semibold text-lg">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h3 className="text-card-title font-medium text-ink">{member.name}</h3>
                      <p className="text-body-sm text-brand-copper">{member.role}</p>
                    </div>
                    <p className="text-body-sm text-ink-muted">{member.bio}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Timeline</h2>
          <div className="flex flex-col gap-6">
            {milestones.map((milestone, index) => (
              <motion.div
                key={milestone.year}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.06 }}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-16 text-right">
                  <span className="text-body-sm font-mono text-brand-copper">{milestone.year}</span>
                </div>
                <div className="flex-shrink-0 w-px h-12 bg-hairline mt-1" />
                <div className="flex-1 pb-6 border-b border-hairline last:border-0">
                  <p className="text-body text-ink">{milestone.event}</p>
                </div>
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
                <h2 className="text-headline font-semibold text-ink">Join the team</h2>
                <p className="text-body text-ink-muted mt-2">
                  We&apos;re hiring researchers, engineers, and operators who want to build the future of AI.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 justify-start sm:justify-end">
                <Button variant="primary" size="lg" asChild>
                  <Link href="/careers">View Open Positions</Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/contact">Contact Us</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}