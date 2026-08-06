import { Button, Card, Badge } from '@/components/ui';
import Link from 'next/link';

const models = [
  {
    name: 'Silkon 1T',
    slug: 'silkon-1t',
    tagline: '1 trillion parameters. Unified intelligence.',
    description: 'Our flagship model with 1T parameters, trained on diverse high-quality data.',
    status: 'available' as const,
    specs: { params: '1T', context: '128K', training: '10T tokens' },
    badges: ['Flagship', 'Multimodal'],
  },
  {
    name: 'Silkon 7B',
    slug: 'silkon-7b',
    tagline: 'Efficient frontier performance at small scale.',
    description: 'Compact yet powerful model optimized for edge deployment and high-throughput inference.',
    status: 'coming-soon' as const,
    specs: { params: '7B', context: '32K', training: '2T tokens' },
    badges: ['Efficient', 'Open Weights'],
  },
  {
    name: 'Silkon 400M',
    slug: 'silkon-400m',
    tagline: 'Ultra-lightweight for on-device AI.',
    description: 'Designed for mobile and embedded applications without sacrificing reasoning quality.',
    status: 'coming-soon' as const,
    specs: { params: '400M', context: '8K', training: '500B tokens' },
    badges: ['On-Device', 'Edge'],
  },
];

export default function ModelsPage() {
  return (
    <main id="main-content" className="min-h-screen">
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="flex flex-col items-start gap-6">
            <h1 className="text-display-md sm:text-display-lg font-semibold tracking-tight text-ink">
              Models
            </h1>
            <p className="max-w-2xl text-body-lg text-ink-muted">
              A family of frontier models built on the same silicon foundation, scaled from edge to supercomputer.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {models.map((model) => (
              <Card
                key={model.slug}
                variant="interactive"
                padding="lg"
                className="flex flex-col"
              >
                <div className="flex flex-col gap-4 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-card-title font-medium text-ink">{model.name}</h2>
                    <span className="text-caption text-ink-muted">
                      {model.status === 'available' ? 'Available' : 'Coming Soon'}
                    </span>
                  </div>

                  <p className="text-body text-ink-muted flex-1">{model.description}</p>

                  <div className="flex flex-wrap gap-2">
                    {model.badges.map((badge) => (
                      <span key={badge} className="text-caption bg-copper/15 text-copper px-2 py-0.5 rounded-full">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-hairline">
                    <div>
                      <p className="text-caption text-ink-tertiary">Params</p>
                      <p className="text-body font-medium text-ink">{model.specs.params}</p>
                    </div>
                    <div>
                      <p className="text-caption text-ink-tertiary">Context</p>
                      <p className="text-body font-medium text-ink">{model.specs.context}</p>
                    </div>
                    <div>
                      <p className="text-caption text-ink-tertiary">Training</p>
                      <p className="text-body font-medium text-ink">{model.specs.training}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-hairline">
                  <Button
                    variant="secondary"
                    className="w-full"
                    asChild
                  >
                    <Link href={`/models/${model.slug}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}