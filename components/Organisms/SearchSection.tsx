"use client"

import { useState } from "react"
import { NavSearchBar, } from "../Molecules/NavSearchBar"
import { cn } from "@/lib/utils"

export interface SearchSectionProps {
  onSearch?: (value: string) => void
  className?: string
}

export function SearchSection({ onSearch, className }: SearchSectionProps) {
  const [searchVariant, setSearchVariant] = useState<string>("default")
  const [searchResults, setSearchResults] = useState<string[]>([])

  const handleSearch = (value: string) => {
    // Simulate search results
    if (value.trim()) {
      setSearchResults([`Result for "${value}"`, `Another result for "${value}"`])
    } else {
      setSearchResults([])
    }

    if (onSearch) {
      onSearch(value)
    }
  }

  const handleFocus = () => {
    setSearchVariant("active")
  }

  const handleClear = () => {
    setSearchVariant("default")
    setSearchResults([])
  }

  return (
    <div className={cn("relative w-full", className)}>
      <NavSearchBar onSearch={handleSearch} />

      {searchResults.length > 0 && (
        <div className="mt-2 absolute top-full w-full left-0 rounded-lg bg-black-300 p-2">
          <ul>
            {searchResults.map((result, index) => (
              <li key={index} className="p-2 text-white hover:bg-black-200 rounded">
                {result}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}


