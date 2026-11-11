import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { completeTopics, removeTopics, useCourses } from '../../api/courses'
import { readAuthError } from '../../api/auth'
import ProgressBar from '../../components/ProgressBar'
import Shell from '../../components/Shell'
import { dictionary } from '../../dictionary/dictionary'
import { useUser } from '../../context/UserContext'
import { classes } from '../../utils/classes'
import Classroom from './Classroom'
import './Courses.scss'

function Arrow({ direction }: { direction: 'right' | 'down' }) {
  return (
    <span className={`tree-arrow tree-arrow-${direction}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="36" height="36">
        <path
          d="M5 12h12M13 6l6 6-6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function topicState(progress: number | undefined) {
  if (progress === 100) return 'complete'
  if (progress !== undefined && progress < 100) return 'ongoing'
  return null
}

function subjectState(topics: { name: string }[], progressByTopic: Map<string, number>) {
  if (topics.length === 0) return null

  const states = topics.map((topic) => topicState(progressByTopic.get(topic.name)))
  if (states.some((state) => state === 'ongoing')) return 'ongoing'
  if (states.every((state) => state === 'complete')) return 'complete'
  return null
}

function lessonCounts(topics: { name: string }[], progressByTopic: Map<string, number>) {
  let active = 0
  let completed = 0

  for (const topic of topics) {
    const progress = progressByTopic.get(topic.name)
    if (progress === undefined) continue
    if (progress === 100) completed += 1
    else if (progress < 100) active += 1
  }

  return { active, completed }
}

function nextInCourse(
  subjects: { name: string; topics: { name: string }[] }[],
  progressByTopic: Map<string, number>,
) {
  for (const subject of subjects) {
    for (const topic of subject.topics) {
      const progress = progressByTopic.get(topic.name)
      if (progress === undefined || progress < 100) {
        return { subject: subject.name, topic: topic.name }
      }
    }
  }

  return null
}

function Check() {
  return (
    <span className="complete-mark" role="img" aria-label={dictionary.courses.completed}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M5 12.5 9.5 17 19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function Dots() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  )
}

function ActionMenu({
  menuId,
  openId,
  setOpenId,
  items,
}: {
  menuId: string
  openId: string | null
  setOpenId: (id: string | null) => void
  items: { label: string; onSelect: () => void }[]
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const open = openId === menuId
  const [place, setPlace] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (!open) return

    function placeMenu() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const height = 96
      const below = window.innerHeight - rect.bottom
      const top = below < height + 12 ? rect.top - height - 6 : rect.bottom + 6
      setPlace({ top, right: Math.max(8, window.innerWidth - rect.right) })
    }

    placeMenu()

    function onPointer(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.action-menu-list')) return
      setOpenId(null)
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null)
    }

    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open, setOpenId])

  return (
    <div className="action-menu">
      <button
        ref={buttonRef}
        type="button"
        className="action-menu-button"
        aria-label={dictionary.courses.actions}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenId(open ? null : menuId)}
      >
        <Dots />
      </button>
      {open ? (
        <div className="action-menu-list" role="menu" style={{ top: place.top, right: place.right }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenId(null)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function Category() {
  const { category = '' } = useParams()
  const { user } = useUser()
  const { data: courses = [], error, isLoading } = useCourses(category)
  const [openCourse, setOpenCourse] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [classroom, setClassroom] = useState<string | null>(null)
  const progressByTopic = new Map(user?.topics.map((entry) => [entry.topic.name, entry.progress]))

  function runTopicAction(action: () => Promise<void>) {
    setActionError(null)
    void action().catch((error: unknown) => setActionError(readAuthError(error)))
  }

  return (
    <Shell>
      <main className="courses">
        <h1>{category}</h1>
        {error ? (
          <p className="courses-status">{dictionary.courses.coursesFailed}</p>
        ) : isLoading ? null : courses.length === 0 ? (
          <p className="courses-status">{dictionary.courses.empty}</p>
        ) : (
          <>
          <p className="course-prompt">{dictionary.courses.chooseSubject}</p>
          {actionError ? <p className="courses-status">{actionError}</p> : null}
          <div className="course-list">
            {courses.map((course) => {
              const courseOpen = openCourse === course.name
              const next = courseOpen ? nextInCourse(course.subjects, progressByTopic) : null
              const topics = course.subjects.flatMap((subject) => subject.topics)
              const courseDone = subjectState(topics, progressByTopic) === 'complete'
              const { active, completed } = lessonCounts(
                topics,
                progressByTopic,
              )
              return (
              <section className={classes('course', courseOpen && 'is-open', courseDone && 'is-complete')} key={course.name}>
                <h2>
                  <button
                    type="button"
                    className="course-toggle"
                    aria-expanded={courseOpen}
                    onClick={() => {
                      setOpenCourse(courseOpen ? null : course.name)
                      setOpenKey(null)
                      setMenuId(null)
                    }}
                  >
                    <span className="course-heading">
                      <span className="course-name">{course.name}</span>
                      <span className="course-lessons">
                        <span className="topic-active">{dictionary.courses.activeTopics(active)}</span>
                        <span className="topic-completed">{dictionary.courses.completedTopics(completed)}</span>
                      </span>
                    </span>
                    <span className="course-meta">
                      <span className="course-count">{dictionary.courses.activeSubjects(course.subjects.length)}</span>
                      <span className="course-chevron">
                        <Arrow direction="right" />
                      </span>
                    </span>
                    {courseDone ? (
                      <span className="course-done">
                        <Check />
                        {dictionary.courses.courseCompleted}
                      </span>
                    ) : null}
                  </button>
                </h2>
                <div className="course-panel">
                  <div className="course-panel-inner">
                {course.subjects.length > 0 ? (
                  <ol className="subjects">
                    {course.subjects.map((subject, index) => {
                      const key = `${course.name}:${subject.name}`
                      const open = openKey === key
                      const state = subjectState(subject.topics, progressByTopic)
                      const subjectNext = next?.subject === subject.name && !open
                      return (
                        <li key={subject.name}>
                          <div className="subject-card">
                          {state === 'complete' ? (
                            <span className="subject-label subject-label-complete">
                              <Check />
                              {dictionary.courses.subjectCompleted}
                            </span>
                          ) : null}
                          {subjectNext ? (
                            <span className="subject-label subject-label-current">{dictionary.courses.currentPosition}</span>
                          ) : null}
                          <button
                            type="button"
                            className={classes('subject', open && 'is-open', state && `is-${state}`, subjectNext && 'is-next')}
                            aria-expanded={open}
                            onClick={() => {
                              setOpenKey(open ? null : key)
                              setMenuId(null)
                            }}
                          >
                            <h3>{subject.name}</h3>
                            <p>{subject.description}</p>
                          </button>
                          <ActionMenu
                            menuId={`${key}:menu`}
                            openId={menuId}
                            setOpenId={setMenuId}
                            items={[
                              { label: dictionary.courses.markCompleted, onSelect: () => runTopicAction(() => completeTopics(subject.name)) },
                              { label: dictionary.courses.resetTopics, onSelect: () => runTopicAction(() => removeTopics(subject.name)) },
                            ]}
                          />
                          </div>
                          <div className={classes('topic-panel', open && 'is-open')}>
                            <div className="topic-panel-inner">
                              <div className="topic-tree">
                                <Arrow direction="down" />
                                <ol className="topics">
                                  {subject.topics.map((topic, topicIndex) => {
                                    const progress = progressByTopic.get(topic.name)
                                    const state = topicState(progress)
                                    const topicNext = next?.subject === subject.name && next.topic === topic.name && open
                                    return (
                                    <li key={topic.name}>
                                      {topicIndex > 0 ? <Arrow direction="right" /> : null}
                                      <div className="topic-card">
                                      {state === 'complete' ? <Check /> : null}
                                      <button
                                        type="button"
                                        className={classes('topic', state && `is-${state}`, topicNext && 'is-next')}
                                        onClick={() => {
                                          setMenuId(null)
                                          setClassroom(topic.name)
                                        }}
                                      >
                                        <span>{topic.name}</span>
                                        {progress === undefined ? null : <ProgressBar progress={progress} />}
                                      </button>
                                      <ActionMenu
                                        menuId={`${key}:${topic.name}:menu`}
                                        openId={menuId}
                                        setOpenId={setMenuId}
                                        items={[
                                          { label: dictionary.courses.markCompleted, onSelect: () => runTopicAction(() => completeTopics(topic.name)) },
                                          { label: dictionary.courses.resetTopic, onSelect: () => runTopicAction(() => removeTopics(topic.name)) },
                                        ]}
                                      />
                                      </div>
                                    </li>
                                    )
                                  })}
                                </ol>
                              </div>
                            </div>
                          </div>
                          {index < course.subjects.length - 1 ? <Arrow direction="down" /> : null}
                        </li>
                      )
                    })}
                  </ol>
                ) : null}
                  </div>
                </div>
              </section>
              )
            })}
          </div>
          </>
        )}
      </main>
      {classroom ? <Classroom topic={classroom} onClose={() => setClassroom(null)} /> : null}
    </Shell>
  )
}
