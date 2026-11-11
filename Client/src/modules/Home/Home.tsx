import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import logo from '../../assets/LogoHelmet.png'
import Shell from '../../components/Shell'
import { dictionary } from '../../dictionary/dictionary'
import './Home.scss'

const exchanges = dictionary.session.exchanges

export default function Home() {
  const { hash } = useLocation()
  const [index, setIndex] = useState(0)
  const [replyVisible, setReplyVisible] = useState(false)
  const exchange = exchanges[index]

  useEffect(() => {
    if (hash !== '#how') return
    const frame = window.requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.getElementById('how')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hash])

  useEffect(() => {
    const reveal = window.setTimeout(() => setReplyVisible(true), 1200)
    const next = window.setTimeout(() => {
      setReplyVisible(false)
      setIndex((current) => (current + 1) % exchanges.length)
    }, 4600)
    return () => {
      window.clearTimeout(reveal)
      window.clearTimeout(next)
    }
  }, [index])

  return (
    <Shell>
      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{dictionary.hero.eyebrow}</p>
            <h1>{dictionary.hero.title}</h1>
            <p className="lead">{dictionary.hero.lead}</p>
          </div>

          <article className="session" id="session" aria-live="polite">
            <header className="session-top">
              <div>
                <p className="session-field">{dictionary.session.lesson}</p>
                <p className="session-status">
                  <span className="live-dot" aria-hidden="true" />
                  {dictionary.session.live}
                </p>
              </div>
            </header>

            <div className="exchange" key={index}>
              <div className="turn you-turn">
                <span>{dictionary.session.you}</span>
                <p>{exchange.you}</p>
              </div>
              <div className="turn tutor-turn">
                <span>{dictionary.session.tutor}</span>
                {replyVisible ? (
                  <p className="tutor-reply">{exchange.tutor}</p>
                ) : (
                  <p className="thinking" aria-label={dictionary.session.thinking}>
                    <span />
                    <span />
                    <span />
                  </p>
                )}
              </div>
            </div>

            <footer className="session-foot">
              <Waveform />
              <p>{dictionary.session.listening}</p>
            </footer>
          </article>
        </section>

        <section className="steps" id="how">
          <div className="section-intro">
            <p className="eyebrow">{dictionary.steps.kicker}</p>
            <h2>{dictionary.steps.title}</h2>
          </div>
          <ol>
            {dictionary.steps.items.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <img className="footer-logo" src={logo} alt="" />
        <div>
          <strong>{dictionary.app.title}</strong>
          <p>{dictionary.footer.note}</p>
        </div>
      </footer>
    </Shell>
  )
}

function Waveform() {
  return (
    <span className="waveform" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
