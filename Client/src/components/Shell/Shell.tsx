import type { ReactNode } from 'react'
import Header from '../Header'
import '../../style/shell.scss'

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="home">
      <Header />
      {children}
    </div>
  )
}
