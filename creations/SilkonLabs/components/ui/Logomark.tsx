/**
 * Silkon Labs — Logomark Component
 * Text-based wordmark with geometric accent, no external assets needed.
 */

import React from 'react';

interface LogomarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'inverse' | 'mono';
  className?: string;
  ariaLabel?: string;
}

export function Logomark({
  size = 'md',
  variant = 'default',
  className = '',
  ariaLabel = 'Silkon Labs',
}: LogomarkProps) {
  const sizeClasses = {
    sm: 'text-[14px]',
    md: 'text-[19px]',
    lg: 'text-[24px]',
    xl: 'text-[28px]',
  };

  const variantClasses = {
    default: 'text-ink',
    inverse: 'text-ink-inverse',
    mono: 'text-ink-subtle',
  };

  const baseStyles = `
    inline-flex items-center gap-2
    font-display font-normal tracking-[-0.01em]
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${className}
  `.trim();

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      className={baseStyles}
      viewBox="0 0 200 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: 'auto', height: '1em', display: 'inline-block' }}
    >
      {/* Geometric mark — silicon crystal lattice abstraction */}
      <defs>
        <linearGradient id="copper-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0551a" />
          <stop offset="100%" stopColor="#c94214" />
        </linearGradient>
        <linearGradient id="steel-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#637385" />
          <stop offset="100%" stopColor="#525f70" />
        </linearGradient>
      </defs>

      {/* Lattice structure — 4 nodes representing silicon crystal */}
      <g transform="translate(4, 12)">
        <circle cx="0" cy="0" r="3" fill="url(#copper-gradient)" />
        <circle cx="12" cy="0" r="3" fill="url(#steel-gradient)" />
        <circle cx="0" cy="12" r="3" fill="url(#steel-gradient)" />
        <circle cx="12" cy="12" r="3" fill="url(#copper-gradient)" />

        {/* Connecting lines — bonds */}
        <line x1="3" y1="0" x2="9" y2="0" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="0" y1="3" x2="0" y2="9" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="12" y1="3" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="3" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.15" />
        <line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.15" />
      </g>

      {/* Wordmark */}
      <text
        x="28"
        y="22"
        fontFamily="Geist, Inter, SF Pro Display, system-ui, sans-serif"
        fontSize="24"
        fontWeight="400"
        letterSpacing="-0.01em"
        fill="currentColor"
      >
        Silkon Labs
      </text>
    </svg>
  );
}

// ── Simplified text-only version for small spaces ──
export function LogomarkText({
  size = 'md',
  variant = 'default',
  className = '',
  ariaLabel = 'Silkon Labs',
}: LogomarkProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };

  const variantClasses = {
    default: 'text-ink',
    inverse: 'text-ink-inverse',
    mono: 'text-ink-subtle',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-display font-normal tracking-[-0.01em]
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `.trim()}
      aria-label={ariaLabel}
    >
      <span className="font-medium" style={{ color: 'var(--sl-brand-copper)' }}>
        Silkon
      </span>
      <span className="font-normal">Labs</span>
    </span>
  );
}

// ── Minimal mark only (for favicon, avatar, etc.) ──
export function LogomarkSymbol({
  size = 32,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Silkon Labs"
    >
      <defs>
        <linearGradient id="mark-copper" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0551a" />
          <stop offset="100%" stopColor="#c94214" />
        </linearGradient>
        <linearGradient id="mark-steel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#637385" />
          <stop offset="100%" stopColor="#525f70" />
        </linearGradient>
      </defs>

      {/* Rounded square container */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="6" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />

      {/* Lattice nodes */}
      <circle cx="9" cy="9" r="4" fill="url(#mark-copper)" />
      <circle cx="23" cy="9" r="4" fill="url(#mark-steel)" />
      <circle cx="9" cy="23" r="4" fill="url(#mark-steel)" />
      <circle cx="23" cy="23" r="4" fill="url(#mark-copper)" />

      {/* Bonds */}
      <line x1="13" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="9" y1="13" x2="9" y2="19" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="23" y1="13" x2="23" y2="19" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="13" y1="23" x2="19" y2="23" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}