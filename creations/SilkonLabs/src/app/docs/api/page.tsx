'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DocsLayout } from '@/components/layout/DocsLayout';
import { Card, Badge, Button } from '@/components/ui';
import { endpoints } from '@/data/docs';

const methodColors: Record<string, string> = {
  GET: 'success',
  POST: 'copper',
  PUT: 'steel',
  DELETE: 'danger',
};

export default function APIReferencePage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <DocsLayout>
      <div className="container py-12 sm:py-16 lg:py-20">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-12"
        >
          <h1 className="text-display-md sm:text-display-lg font-semibold tracking-tight text-ink mb-4">
            API Reference
          </h1>
          <p className="max-w-2xl text-body-lg text-ink-muted">
            REST API for Silkon models. All endpoints require authentication via Bearer token.
          </p>
        </motion.section>

        {/* Base URL */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mb-12"
        >
          <Card variant="elevated" padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Badge variant="steel">Base URL</Badge>
                <code className="code-inline text-body">https://api.silkonlabs.com/v1</code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard('https://api.silkonlabs.com/v1', 'base-url')}
              >
                {copied === 'base-url' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </Card>
        </motion.section>

        {/* Endpoints */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="space-y-6">
            {endpoints.map((endpoint, index) => (
              <motion.div
                key={endpoint.path}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Card variant="default" padding="lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <Badge variant={methodColors[endpoint.method] as any} size="lg">
                        {endpoint.method}
                      </Badge>
                      <code className="text-body text-ink font-mono">{endpoint.path}</code>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(endpoint.exampleRequest, endpoint.path)}
                    >
                      {copied === endpoint.path ? 'Copied!' : 'Copy cURL'}
                    </Button>
                  </div>

                  <p className="text-body text-ink-muted mb-6">{endpoint.description}</p>

                  {/* Parameters */}
                  {endpoint.parameters.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-body-sm font-medium text-ink mb-3">Parameters</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-body-sm">
                          <thead>
                            <tr className="border-b border-hairline">
                              <th className="pb-2 text-ink-muted">Name</th>
                              <th className="pb-2 text-ink-muted">Type</th>
                              <th className="pb-2 text-ink-muted">Required</th>
                              <th className="pb-2 text-ink-muted">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {endpoint.parameters.map((param) => (
                              <tr key={param.name} className="border-b border-hairline last:border-0">
                                <td className="py-2 font-mono text-ink">{param.name}</td>
                                <td className="py-2 text-ink-muted font-mono">{param.type}</td>
                                <td className="py-2">
                                  <Badge variant={param.required ? 'copper' : 'steel'} size="sm">
                                    {param.required ? 'Required' : 'Optional'}
                                  </Badge>
                                </td>
                                <td className="py-2 text-ink-muted">{param.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Responses */}
                  <div className="mb-6">
                    <h4 className="text-body-sm font-medium text-ink mb-3">Responses</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-body-sm">
                        <thead>
                          <tr className="border-b border-hairline">
                            <th className="pb-2 text-ink-muted">Code</th>
                            <th className="pb-2 text-ink-muted">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {endpoint.responses.map((resp) => (
                            <tr key={resp.code} className="border-b border-hairline last:border-0">
                              <td className="py-2 font-mono text-brand-copper">{resp.code}</td>
                              <td className="py-2 text-ink-muted">{resp.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Code Examples */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-body-sm font-medium text-ink">Request</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(endpoint.exampleRequest, `${endpoint.path}-req`)}
                        >
                          {copied === `${endpoint.path}-req` ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="code-block text-body-sm overflow-x-auto">
                        {endpoint.exampleRequest}
                      </pre>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-body-sm font-medium text-ink">Response</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(endpoint.exampleResponse, `${endpoint.path}-res`)}
                        >
                          {copied === `${endpoint.path}-res` ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <pre className="code-block text-body-sm overflow-x-auto">
                        {endpoint.exampleResponse}
                      </pre>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </DocsLayout>
  );
}