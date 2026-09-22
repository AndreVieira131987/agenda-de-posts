import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function AppLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-light">
      <header className="border-b border-secondary/30 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/clientes" className="font-serif text-xl font-semibold text-dark">
            Agenda de Posts
          </Link>
          <button type="button" onClick={() => signOut()} className="text-sm text-dark/60 hover:text-brand">
            Sair
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
