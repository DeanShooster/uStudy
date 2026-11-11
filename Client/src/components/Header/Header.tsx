import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useUser } from '../../context/UserContext'
import { dictionary } from '../../dictionary/dictionary'
import AuthDialog from '../AuthDialog'
import Mark from '../Mark'

export default function Header() {
  const { user, ready } = useUser()
  const { pathname } = useLocation()
  const [authOpen, setAuthOpen] = useState(false)
  const onHome = pathname === '/'

  return (
    <header className="nav">
      <Link className="brand" to="/">
        <Mark />
        <span>{dictionary.app.title}</span>
      </Link>
      <nav className="nav-links" aria-label={dictionary.app.title}>
        {onHome ? (
          <a href="#how">{dictionary.nav.how}</a>
        ) : (
          <Link to="/#how">{dictionary.nav.how}</Link>
        )}
        {!ready ? null : user != null ? (
          <>
            <Link to="/courses" className="nav-item">
              {dictionary.nav.courses}
            </Link>
            <span className="nav-user">
              <span className="nav-user-mark" aria-hidden="true">
                {user.name.slice(0, 1)}
              </span>
              {user.name}
            </span>
          </>
        ) : (
          <button type="button" className="button button-solid" onClick={() => setAuthOpen(true)}>
            {dictionary.nav.logIn}
          </button>
        )}
      </nav>
      {authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}
    </header>
  )
}
