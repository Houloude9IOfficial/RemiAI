'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
import { getPostBySlug, getPostsByType } from '@/data/posts';

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const post = getPostBySlug(params.slug as string);

  if (!post) {
    notFound();
  }

  const relatedPosts = getPostsByType(post.type).filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <main id="main-content" className="min-h-screen">
      {/* Header */}
      <header className="py-20 sm:py-28">
        <div className="container-narrow">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/blog" className="link-muted text-caption">
                ← Back to Blog
              </Link>
              <Badge variant={post.type === 'research' ? 'copper' : 'steel'}>
                {post.type === 'research' ? 'Research' : 'Blog'}
              </Badge>
              <Badge variant="steel">{post.readingTime}</Badge>
            </div>

            <h1 className="text-display-md sm:text-display-lg font-semibold tracking-tight text-ink text-balance">
              {post.title}
            </h1>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-copper flex items-center justify-center text-white font-medium flex-shrink-0">
                {post.author.avatar}
              </div>
              <div>
                <p className="text-body-sm font-medium text-ink">{post.author.name}</p>
                <p className="text-body-sm text-ink-muted">{post.author.role}</p>
              </div>
              <div className="h-5 w-px bg-hairline mx-1" />
              <p className="text-body-sm text-ink-tertiary">
                {new Date(post.date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Content */}
      <section className="pb-16 sm:pb-24">
        <div className="container-narrow">
          <div className="flex flex-wrap gap-2 mb-8">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="default">
                {tag}
              </Badge>
            ))}
          </div>

          <Card variant="default" padding="lg" className="prose prose-invert max-w-none">
            <div className="flex flex-col gap-6 text-body text-ink-muted">
              <p className="text-body-lg text-ink leading-relaxed">{post.excerpt}</p>
              <div className="h-px bg-hairline" />
              <p>
                This is a placeholder article body. Connect an MDX pipeline to render real content
                from <code className="code-inline">{`/src/app/blog/${post.slug}.mdx`}</code>.
              </p>
              <p>
                The design system, typography, and layout are fully wired. Swap in real content
                (or hook up MDX) without touching the presentational layer.
              </p>
              <h3 className="text-headline font-semibold text-ink">The stack</h3>
              <ul className="space-y-1.5">
                <li>Next.js 15 (App Router)</li>
                <li>Tailwind CSS with Silkon design tokens</li>
                <li>Framer Motion for micro-interactions</li>
                <li>Industrial/metallic copper + steel theme</li>
              </ul>
              <blockquote className="border-l-2 border-brand-copper pl-4 text-ink-muted italic">
                “Rigor first. This is backed by measurement.”
              </blockquote>
              <h3 className="text-headline font-semibold text-ink">Next steps</h3>
              <p>
                Replace the placeholder with real MDX content, or render from a CMS.
                The typing and styling are production-ready.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* Related */}
      {relatedPosts.length > 0 && (
        <section className="py-16 sm:py-24 border-t border-hairline">
          <div className="container">
            <h2 className="text-display-sm font-semibold text-ink mb-8">Related</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedPosts.map((related) => (
                <Card key={related.slug} variant="interactive" padding="lg" className="flex flex-col">
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex gap-2">
                      <Badge variant="steel" size="sm">
                        {related.readingTime}
                      </Badge>
                    </div>
                    <Link
                      href={`/blog/${related.slug}`}
                      className="text-card-title font-medium text-ink hover:text-brand-copper transition-colors line-clamp-2"
                    >
                      {related.title}
                    </Link>
                    <p className="text-body text-ink-muted line-clamp-2">{related.excerpt}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-hairline">
                    <div className="w-6 h-6 rounded-full bg-gradient-copper flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                      {related.author.avatar}
                    </div>
                    <p className="text-caption text-ink-muted">{related.author.name}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}