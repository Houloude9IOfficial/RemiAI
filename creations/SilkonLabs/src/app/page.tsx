import { Logomark } from '@/components/ui/Logomark';
import Link from 'next/link';

export default function Home() {
  return (
    <main id="main-content" className="min-h-screen">
      {/* Hero */}
      <section className="relative py-20 sm:py-28 lg:py-36">
        <div className="container">
          <div className="flex flex-col items-center text-center">
            {/* Logo */}
            <div className="mb-8">
              <Logomark size="xl" />
            </div>

            {/* Tagline */}
            <h1 className="text-display-md sm:text-display-lg lg:text-display-xl font-semibold tracking-tight text-ink">
              Building the silicon foundation for AGI
            </h1>

            {/* Subhead */}
            <p className="mt-6 max-w-2xl text-body-lg text-ink-muted">
              Silkon Labs develops frontier AI models. Our flagship model Silkon 1T — 1 trillion parameters, unified intelligence.
            </p>

            {/* CTA */}
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/models" className="btn btn-primary btn-lg">
                Explore Models
              </Link>
              <Link href="/about" className="btn btn-secondary btn-lg">
                Learn More
              </Link>
            </div>
          </div>
        </div>

        {/* Background — subtle mesh gradient */}
        <div className="absolute inset-0 -z-10 bg-gradient-mesh opacity-30" />
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="surface-card p-6 transition-all duration-normal ease-signature"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-copper flex items-center justify-center">
                    <span className="text-white font-bold text-lg">{i}</span>
                  </div>
                  <div>
                    <h3 className="text-card-title font-medium text-ink">
                      Feature {i}
                    </h3>
                    <p className="mt-1 text-body-sm text-ink-muted">
                      Description of feature {i} goes here.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Parameters', value: '1T', suffix: 'params' },
              { label: 'Context', value: '128K', suffix: 'tokens' },
              { label: 'Training', value: '10T', suffix: 'tokens' },
              { label: 'Inference', value: '<1s', suffix: 'latency' },
            ].map((stat, i) => (
              <div
                key={i}
                className="surface-card p-6 text-center transition-all duration-normal ease-signature"
              >
                <p className="text-body-sm text-ink-muted">{stat.label}</p>
                <p className="text-headline font-semibold text-ink mt-1">
                  {stat.value}
                </p>
                <p className="text-caption text-ink-tertiary mt-0.5">{stat.suffix}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="surface-card-elevated p-10 sm:p-12 lg:p-16">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <h2 className="text-headline font-semibold text-ink">
                  Ready to build with Silkon 1T?
                </h2>
                <p className="mt-2 text-body text-ink-muted">
                  Join the waitlist for early access to our frontier model.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 justify-start sm:justify-end">
                <Link href="/models/silkon-1t" className="btn btn-primary">
                  View Silkon 1T
                </Link>
                <Link href="/waitlist" className="btn btn-secondary">
                  Join Waitlist
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}