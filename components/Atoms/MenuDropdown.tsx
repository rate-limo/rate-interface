import { ChevronDownIcon, ChevronUpIcon, LucideIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useState } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { SelectScrollDownButton } from '@radix-ui/react-select';

interface MenuDropdownProps {
  values: string[];
  placeholder: string;
  icon?: LucideIcon;
  defaultValue?: string;
}

export default function MenuDropdown({
  values,
  placeholder,
  icon,
  defaultValue,
}: MenuDropdownProps) {
  const [selectedValue, setSelectedValue] = useState<string | undefined>(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Select
      onValueChange={(value) => {
        setSelectedValue(value);
        // No need to set isOpen here as onOpenChange will handle it
      }}
      onOpenChange={(open) => {
        setIsOpen(open);
      }}
    >
      <SelectTrigger
        className={cn(
          "border-neutral-light-white-12 text-neutral-dark-100 bg-neutral-dark-default w-full px-3 py-2 focus:ring-0 focus:ring-offset-0 data-[placeholder]:text-neutral-dark-100",
          isOpen && "border-primary-default text-neutral-light-default data-[placeholder]:text-neutral-light-default bg-neutral-dark-700"
        )}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && <Icon icon={icon} />}
            <SelectValue placeholder={placeholder} className="text-sm text-green-600 dark:text-green-300" />
          </div>
          {isOpen ? (
            <ChevronUpIcon className="size-4" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </div>
      </SelectTrigger>
      <SelectContent className="w-full border-neutral-light-white-12 bg-neutral-dark-700 text-neutral-dark-100 p-0">
        <SelectScrollDownButton className='hidden'/>
        <SelectScrollUpButton className='hidden'/>
        <SelectGroup className='p-0'>
          {values.map((value: string, i: number) => (
            <SelectItem
              key={i}
              value={value}
              className={ cn( "w-full rounded-none focus:bg-primary-default focus:text-neutral-dark-default text-sm border-b border-neutral-light-white-12 last:border-b-0" ) }
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{value}</span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
