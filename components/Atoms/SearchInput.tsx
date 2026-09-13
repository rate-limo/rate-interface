"use client"

import type React from "react"

import { useState } from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchInputProps {
  placeholder?: string
  onSearch?: (value: string) => void
  className?: string
}

export function SearchInput({ placeholder = "Search Market", onSearch, className = "" }: SearchInputProps) {
  const [value, setValue] = useState("")
  const [isFocused, setIsFocused] = useState(false)

  const handleClear = () => {
    setValue("")
    onSearch?.("")
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    onSearch?.(e.target.value)
  }

  return (
    <div className={`relative flex items-center rounded-full bg-black-400 px-4 py-3 ${className}`}>
      <Search
        className={`mr-3 h-6 w-6 ${isFocused || value ? "text-white" : "text-dark-grey-1"}`}
      />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={isFocused ? "" : placeholder }
        className={cn("flex-1 bg-transparent text-white focus:outline-none ", )}
      />
      {value && (
        <button onClick={handleClear} className="ml-2 text-white">
          <X className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}


