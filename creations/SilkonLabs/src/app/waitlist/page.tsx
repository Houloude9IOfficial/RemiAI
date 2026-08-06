'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Input, Card } from '@/components/ui';
import { Logomark } from '@/components/ui/Logomark';
import Link from 'next/link';

interface FormData {
  name: string;
  email: string;
  company: string;
  useCase: string;
  _honeypot: string;
}

export default function WaitlistPage() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    useCase: '',
    _honeypot: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData._honeypot) {
      setStatus('error');
      setError('Invalid submission.');
      return;
    }

    if (!formData.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email.');
      return;
    }

    setStatus('loading');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          company: formData.company.trim(),
          useCase: formData.useCase.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Something went wrong. Please try again.');
      }

      setStatus('success');
      setFormData({ name: '', email: '', company: '', useCase: '', _honeypot: '' });
    } catch {
      setStatus('error');
      setError('Failed to join waitlist. Please try again later.');
    }
  }, [formData]);

  const updateField = (field: keyof FormData) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <main id="main-content" className="min-h-screen">
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="max-w-xl mx-auto">
            <div className="flex flex-col items-center text-center gap-6">
              <Logomark size="md" />
              <h1 className="text-display-md sm:text-display-lg font-semibold tracking-tight text-ink">
                Get Access to Silkon 1T
              </h1>
              <p className="text-body-lg text-ink-muted">
                Join the waitlist for early access. We&apos;ll reach out when spots open up.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="mt-12"
            >
              <Card variant="default" padding="lg">
                <AnimatePresence mode="wait">
                  {status === 'success' ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center gap-4 py-8"
                    >
                      <div className="w-12 h-12 rounded-full bg-success-500/15 border border-success-500/30 flex items-center justify-center">
                        <svg className="w-6 h-6 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-headline font-semibold text-ink">You&apos;re on the list</h2>
                        <p className="text-body text-ink-muted mt-2">
                          We&apos;ll notify you when Silkon 1T access opens up.
                        </p>
                      </div>
                      <div className="flex gap-3 mt-2">
                        <Button variant="secondary" asChild>
                          <Link href="/models">Explore Models</Link>
                        </Button>
                        <Button variant="ghost" asChild>
                          <Link href="/docs">Read the Docs</Link>
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="form"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleSubmit}
                      className="flex flex-col gap-5"
                    >
                      <Input
                        label="Full Name"
                        placeholder="Jane Doe"
                        value={formData.name}
                        onChange={(e) => updateField('name')(e.target.value)}
                        required
                      />

                      <Input
                        label="Email"
                        type="email"
                        placeholder="jane@company.com"
                        value={formData.email}
                        onChange={(e) => updateField('email')(e.target.value)}
                        required
                      />

                      <Input
                        label="Company"
                        placeholder="Acme Inc."
                        value={formData.company}
                        onChange={(e) => updateField('company')(e.target.value)}
                      />

                      <div className="w-full">
                        <label className="label">Use Case</label>
                        <textarea
                          className="input min-h-[100px] resize-y"
                          placeholder="Tell us how you plan to use Silkon 1T..."
                          value={formData.useCase}
                          onChange={(e) => updateField('useCase')(e.target.value)}
                        />
                      </div>

                      <div className="hidden" aria-hidden="true">
                        <label htmlFor="website">Website</label>
                        <input
                          id="website"
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          value={formData._honeypot}
                          onChange={(e) => updateField('_honeypot')(e.target.value)}
                        />
                      </div>

                      <AnimatePresence>
                        {error && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-caption text-danger-500"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        isLoading={status === 'loading'}
                      >
                        Join Waitlist
                      </Button>

                      <p className="text-caption text-ink-tertiary text-center">
                        No spam. We&apos;ll only reach out when access is ready.
                      </p>
                    </motion.form>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}