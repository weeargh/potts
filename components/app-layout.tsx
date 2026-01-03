"use client"

import { AppSidebar } from "./app-sidebar"

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 md:ml-56 overflow-auto">
        {children}
      </main>
    </div>
  )
}
