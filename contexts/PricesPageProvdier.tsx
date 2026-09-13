"use client"

import { createContext, useContext, type ReactNode, useState } from "react"

type PricesPageContextType = {
  searchQuery: string
  setSearchQuery: (query: string) => void
  activeTab: string
  setActiveTab: (tab: string) => void
}

const PricesPageContext = createContext<PricesPageContextType | undefined>(undefined)

export function PricesPageProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")

  return (
    <PricesPageContext.Provider value={{ searchQuery, setSearchQuery, activeTab, setActiveTab }}>
      {children}
    </PricesPageContext.Provider>
  )
}

export function usePricesPage() {
  const context = useContext(PricesPageContext)
  if (context === undefined) {
    throw new Error("usePricesPage must be used within a PricesPageProvider")
  }
  return context
}
