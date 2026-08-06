'use client';

import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftAddon, rightAddon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          {leftAddon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              input
              ${leftAddon ? 'pl-10' : ''}
              ${rightAddon ? 'pr-10' : ''}
              ${error ? 'input-error' : ''}
              ${className}
            `.trim()}
            {...props}
          />
          {rightAddon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-ink-subtle">
              {rightAddon}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-caption text-danger-500">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-caption text-ink-tertiary">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s/g, '-');
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            input min-h-[120px] resize-y
            ${error ? 'input-error' : ''}
            ${className}
          `.trim()}
          {...props}
        />
        {error && <p className="mt-1.5 text-caption text-danger-500">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-caption text-ink-tertiary">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';