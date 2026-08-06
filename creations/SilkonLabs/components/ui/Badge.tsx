import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'copper' | 'steel' | 'platinum' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center gap-1.5 font-text font-medium rounded-full';

  const variantStyles = {
    default: 'bg-surface-2 text-ink-muted border border-hairline',
    copper: 'bg-copper-500/15 text-copper-400 border border-copper-500/30',
    steel: 'bg-steel-500/15 text-steel-400 border border-steel-500/30',
    platinum: 'bg-platinum-500/15 text-platinum-400 border border-platinum-500/30',
    success: 'bg-success-500/15 text-success-500 border border-success-500/30',
    warning: 'bg-warning-500/15 text-warning-500 border border-warning-500/30',
    danger: 'bg-danger-500/15 text-danger-500 border border-danger-500/30',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-caption px-2.5 py-1',
    lg: 'text-body-sm px-3 py-1.5',
  };

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />}
      {children}
    </span>
  );
}