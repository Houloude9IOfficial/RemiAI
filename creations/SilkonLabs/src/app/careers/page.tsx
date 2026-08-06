'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Badge, Input } from '@/components/ui';
import Link from 'next/link';
import { jobs, departments, locations, types, type Job } from '@/data/jobs';

export default function CareersPage() {
  const [filters, setFilters] = useState({
    department: 'all',
    location: 'all',
    type: 'all',
    search: '',
  });
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (filters.department !== 'all' && job.department !== filters.department) return false;
      if (filters.location !== 'all' && !job.location.includes(filters.location)) return false;
      if (filters.type !== 'all' && job.type !== filters.type) return false;
      if (filters.search) {
        const query = filters.search.toLowerCase();
        if (!job.title.toLowerCase().includes(query) &&
            !job.description.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [filters]);

  const hasFilters = filters.department !== 'all' || filters.location !== 'all' || filters.type !== 'all' || filters.search;

  return (
    <main id="main-content" className="min-h-screen">
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="flex flex-col gap-6">
            <h1 className="text-display-md sm:text-display-lg lg:text-display-xl font-semibold tracking-tight text-ink">
              Careers
            </h1>
            <p className="max-w-2xl text-body-lg text-ink-muted">
              We&apos;re building the silicon foundation for AGI. Join a team that values rigor, openness, and scalable design.
            </p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="pb-8">
        <div className="container">
          <Card variant="default" padding="md" className="overflow-hidden">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <Input
                  label="Search"
                  placeholder="Search roles..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  leftAddon={<span className="text-ink-subtle">🔍</span>}
                />
              </div>
              <div className="min-w-[180px]">
                <label className="label">Department</label>
                <select
                  className="input"
                  value={filters.department}
                  onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="min-w-[180px]">
                <label className="label">Location</label>
                <select
                  className="input"
                  value={filters.location}
                  onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                >
                  <option value="all">All Locations</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="label">Type</label>
                <select
                  className="input"
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                >
                  <option value="all">All Types</option>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {hasFilters && (
                <Button variant="ghost" onClick={() => setFilters({ department: 'all', location: 'all', type: 'all', search: '' })}>
                  Clear Filters
                </Button>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Job Listings */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-display-sm font-semibold text-ink">
              Open Positions ({filteredJobs.length})
            </h2>
          </div>

          <AnimatePresence mode="popLayout">
            <motion.div
              key={JSON.stringify(filteredJobs.map(j => j.id))}
              layout
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {filteredJobs.map((job, index) => (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card variant="interactive" padding="lg" className="flex flex-col">
                    <div className="flex flex-col gap-4 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-card-title font-medium text-ink">{job.title}</h3>
                          <p className="text-body-sm text-ink-muted mt-0.5">{job.department} · {job.location} · {job.type}</p>
                        </div>
                        {job.featured && (
                          <Badge variant="copper" size="sm">Featured</Badge>
                        )}
                      </div>

                      <p className="text-body text-ink-muted line-clamp-3">{job.description}</p>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
                        <Badge variant="steel" size="sm">{job.postedDate}</Badge>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-hairline flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 min-w-0"
                        onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                      >
                        {expandedJob === job.id ? 'Hide Details' : 'View Details'}
                      </Button>
                    </div>

                    <AnimatePresence>
                      {expandedJob === job.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-4 pt-4 border-t border-hairline space-y-6"
                        >
                          <div>
                            <h4 className="text-body-sm font-medium text-ink mb-2">Responsibilities</h4>
                            <ul className="space-y-1">
                              {job.responsibilities.map((r, i) => (
                                <li key={i} className="text-body-sm text-ink-muted flex gap-2">
                                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-copper mt-2" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-body-sm font-medium text-ink mb-2">Requirements</h4>
                            <ul className="space-y-1">
                              {job.requirements.map((r, i) => (
                                <li key={i} className="text-body-sm text-ink-muted flex gap-2">
                                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-copper mt-2" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex gap-3">
                            <Button variant="primary" size="sm" asChild>
                              <Link href={`/careers/apply?id=${job.id}`}>Apply Now</Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/careers/${job.id}`}>View Full Description</Link>
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {filteredJobs.length === 0 && (
            <Card variant="default" padding="xl" className="text-center">
              <p className="text-body text-ink-muted">No positions match your filters.</p>
              <Button variant="ghost" className="mt-4" onClick={() => setFilters({ department: 'all', location: 'all', type: 'all', search: '' })}>
                Clear Filters
              </Button>
            </Card>
          )}
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-display-sm font-semibold text-ink mb-8">Why Silkon Labs?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Frontier Research', desc: 'Work on 1T+ parameter models at the edge of capability.' },
              { title: 'Open Culture', desc: 'We publish papers, release weights, and share learnings.' },
              { title: 'Flexible Work', desc: 'Remote-first with hubs in SF, NYC, London. Choose what works.' },
              { title: 'Competitive Package', desc: 'Top-tier salary, equity, compute budget, and learning stipend.' },
              { title: 'Health & Wellness', desc: 'Comprehensive medical, mental health, and family leave.' },
              { title: 'Growth Budget', desc: '$5K/year for conferences, courses, books, and certifications.' },
              { title: 'Compute Access', desc: 'Dedicated GPU allocation for personal research projects.' },
              { title: 'Team Offsites', desc: 'Quarterly gatherings to align, build, and celebrate.' },
            ].map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                <Card variant="default" padding="lg">
                  <h3 className="text-card-title font-medium text-ink">{benefit.title}</h3>
                  <p className="text-body text-ink-muted mt-2">{benefit.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}