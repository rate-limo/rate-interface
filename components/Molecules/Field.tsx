'use client';

import * as React from 'react';
import { Eye, EyeOff, LucideIcon, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Icon } from '../Atoms/Icon';
import { FieldTabProps } from './FieldTab';

export interface FieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  state?: 'default' | 'active' | 'success' | 'error';
  showPasswordToggle?: boolean;
  icon?: LucideIcon;
  disabled?: boolean;
  pretab?: React.ReactNode;
  postab?: React.ReactNode;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  (
    {
      className,
      state = 'default',
      showPasswordToggle = false,
      type = 'text',
      disabled = false,
      icon,
      postab,
      pretab,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const [focused, setFocused] = React.useState(false);
    const inputType = showPasswordToggle
      ? showPassword
        ? 'text'
        : 'password'
      : type;

    return (
      <div
        className={cn(
          'group bg-neutral-dark-default text-neutral-dark-100 border-neutral-light-white-12 ring-offset-background hover:bg-neutral-dark-500  flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors overflow-hidden',
          state === 'success' &&
            'border-success-default bg-neutral-dark-500 text-neutral-light-default',
          state === 'error' &&
            'border-error-default bg-neutral-dark-500 text-neutral-light-default',
          focused &&
            'border-primary-default bg-neutral-dark-500 text-neutral-light-default',
          disabled && "border-neutral-dark-600 text-neutral-dark-500 bg-neutral-dark-700",
          pretab && "pl-0",
          postab && "pr-0",
          className,
        )}
      >
        {pretab}
        {icon && (
          <Icon
            icon={icon}
            className={cn(
              'text-neutral-dark-100 group-hover:text-neutral-dark-100 ',
              state === 'success' && 'text-success-default',
              state === 'error' && 'text-error-default',
              focused && 'text-neutral-light-default',
              disabled && 'text-neutral-dark-500'
            )}
          />
        )}
        <Input
          type={inputType}
          className={ cn(
            "flex-1 border-0 bg-transparent text-neutral-light-100 p-0 placeholder:text-neutral-dark-100 disabled:placeholder:text-neutral-dark-500 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
            (state === 'success' || state === "error" || focused) && 'text-neutral-light-default',
          ) }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          ref={ref}
          {...props}
        />
        {showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className={cn(
              'text-neutral-dark-100 group-hover:text-neutral-dark-100 group-disabled:text-neutral-dark-500',
              state === 'success' && 'text-success-default',
              state === 'error' && 'text-error-default',
              focused && 'text-neutral-light-default',
              disabled && 'text-neutral-dark-500'
            )}
          >
            <Icon icon={showPassword ? EyeOff : Eye}/>
          </button>
        )}
        {postab}
      </div>
    );
  },
);

Field.displayName = 'Field';
