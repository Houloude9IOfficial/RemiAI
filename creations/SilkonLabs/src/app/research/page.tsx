'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Badge, Button } from '@/components/ui';
import Link from 'next/link';
import { getPostsByType, allTags, type Post } from '@/data/posts';

export default function ResearchPage() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const postsPerPage = 6;

  const researchPosts = useMemo(() => getPostsByType('research'), []);

  const filteredPosts = useMemo(() => {
    let result = researchPosts;
    if (selectedTags.length > 0) {
      result = result.filter(p => selectedTags.some(tag => p.tags.includes(tag)));
    }
    return result;
  }, [researchPosts, selectedTags]);

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const paginatedPosts = filteredPosts.slice((page - 1) * postsPerPage, page * postsPerPage);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    setPage(1);
  };

  return (
    <main id="main-content" className="min-h-screen">
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="flex flex-col gap-6">
            <h1 className="text-display-md sm:text-display-lg lg:text-display-xl font-semibold tracking-tight text-ink">
              Research
            </h1>
            <p className="max-w-2xl text-body-lg text-ink-muted">
              We publish everything. Our technical reports, scaling studies, and evaluations are open for the community.
            </p>
          </div>
        </div>
      </section>

      {/* Tag Filters */}
      <section className="pb-8">
        <div className="container">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-caption text-ink-muted">Filter by:</span>
            {allTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? 'copper' : 'default'}
                onClick={() => toggleTag(tag)}
                className="cursor-pointer transition-colors"
              >
                {tag}
              </Badge>
            ))}
            {selectedTags.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Papers */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={selectedTags.join(',') + page}
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {paginatedPosts.map((post, index) => (
                <motion.article
                  key={post.slug}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                >
                  <Card variant="interactive" padding="lg" className="flex flex-col h-full">
                    <div className="flex flex-col gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="copper" size="sm">Research</Badge>
                        <Badge variant="steel" size="sm">{post.readingTime}</Badge>
                      </div>

                      <h2 className="text-card-title font-medium text-ink line-clamp-2">
                        <Link href={`/blog/${post.slug}`} className="hover:text-brand-copper transition-colors">
                          {post.title}
                        </Link>
                      </h2>

                      <p className="text-body text-ink-muted line-clamp-3">{post.excerpt}</p>

                      <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-hairline">
                        {post.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="default" size="sm">{tag}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-hairline">
                      <div className="w-8 h-8 rounded-full bg-gradient-copper flex items-center justify-center text-white text-sm font-medium">
                        {post.author.avatar}
                      </div>
                      <div>
                        <p className="text-body-sm font-medium text-ink">{post.author.name}</p>
                        <p className="text-caption text-ink-muted">{post.author.role} · {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </Card>
                </motion.article>
              ))}
            </motion.div>
          </AnimatePresence>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="flex items-center px-4 text-body-sm text-ink-muted">Page {page} of {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          )}

          {filteredPosts.length === 0 && (
            <Card variant="default" padding="xl" className="text-center mt-8">
              <p className="text-body text-ink-muted">No research posts match your filters.</p>
              <Button variant="ghost" className="mt-4" onClick={() => setSelectedTags([])}>
                Clear Filters
              </Button>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}