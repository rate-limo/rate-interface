'use client';

import type React from 'react';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '../Atoms/IconButton';
import { Icon } from '../Atoms/Icon';

interface NavSearchBarProps {
  placeholder?: string;
  onSearch?: (value: string) => void;
  className?: string;
}

export function NavSearchBar({
  placeholder = 'Search Market',
  onSearch,
  className = '',
}: NavSearchBarProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = () => {
    setValue('');
    onSearch?.('');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onSearch?.(e.target.value);
  };

  return (
    <div
      className={cn(
        'group relative flex min-h-14 items-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-5 py-3 text-[color:var(--m-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_8px_20px_rgba(18,30,48,.08)] transition-[background,border-color,box-shadow] hover:border-[color:var(--m-primary)] hover:bg-[color:var(--m-surface)] focus-within:border-[color:var(--m-primary)] focus-within:shadow-[0_10px_26px_rgba(18,30,48,.14),0_0_0_3px_color-mix(in_srgb,var(--m-primary)_14%,transparent)]',
        className,
      )}
    >
      <Icon
        icon={Search}
        className="mr-3 h-5 w-5 text-[color:var(--m-text-secondary)] transition-colors group-hover:text-[color:var(--m-primary-600)]"
        size={20}
      />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 100)}
        placeholder={isFocused ? '' : placeholder}
        className={
          'flex-1 bg-transparent text-base text-[color:var(--m-text-primary)] placeholder:text-[color:var(--m-text-secondary)] focus:outline-none'
        }
      />
      <IconButton
        icon={X}
        onClick={handleClear}
        className={cn('ml-2 group-hover:text-white', value ? "" : 'opacity-0')}
        size={20}
      />
    </div>
  );
}
