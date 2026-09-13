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

export function NavSearchButton({
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
        'bg-black-300 hover:bg-black-200 group text-dark-grey-1 relative flex items-center rounded-full p-3',
        className,
      )}
    >
      <Icon
        icon={Search}
        className="mr-3 h-5 w-5 group-hover:text-white"
        size={20}
      />
      <p
        className={
          'flex-1 bg-transparent placeholder:text-dark-grey-1 group-hover:text-white group-hover:placeholder:text-white focus:outline-none text-sm'
        }>
          Search
        </p>
      <IconButton
        icon={X}
        onClick={handleClear}
        className={cn('ml-2 group-hover:text-white', value ? "" : 'opacity-0')}
        size={20}
      />
    </div>
  );
}
