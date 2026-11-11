import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { dictionary } from '../../dictionary/dictionary'

type Point = { x: number; y: number }

export type BoardHandle = {
  exportImage: () => string | null
  clear: () => void
  setLesson: (lines: string[]) => void
}

function paint(canvas: HTMLCanvasElement, strokes: Point[][], active: Point[] | null, lesson: string[]) {
  const context = canvas.getContext('2d')
  if (!context) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width === 0 || height === 0) return

  const ratio = window.devicePixelRatio || 1
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const styles = getComputedStyle(canvas)
  context.fillStyle = styles.getPropertyValue('--surface').trim() || '#172033'
  context.fillRect(0, 0, width, height)

  if (lesson.length > 0) {
    const size = lesson.length > 4 ? 22 : 28
    const gap = size + 14
    const top = height * 0.2
    context.fillStyle = '#ffffff'
    context.font = `600 ${size}px Georgia, "Segoe UI", serif`
    context.textAlign = 'center'
    context.textBaseline = 'top'
    lesson.forEach((line, index) => {
      context.fillText(line, width / 2, top + index * gap, width * 0.76)
    })
    context.textAlign = 'left'
  }

  context.strokeStyle = styles.getPropertyValue('--ink').trim() || '#e8eef8'
  context.lineWidth = 2.75
  context.lineCap = 'round'
  context.lineJoin = 'round'

  const all = active ? [...strokes, active] : strokes
  for (const stroke of all) {
    if (stroke.length === 0) continue
    context.beginPath()
    context.moveTo(stroke[0].x * width, stroke[0].y * height)
    if (stroke.length === 1) {
      context.lineTo(stroke[0].x * width + 0.2, stroke[0].y * height)
    } else {
      for (const point of stroke.slice(1)) context.lineTo(point.x * width, point.y * height)
    }
    context.stroke()
  }
}

export default function Board({
  handle,
  prompt,
  onInk,
}: {
  handle: RefObject<BoardHandle | null>
  prompt: string
  onInk?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Point[][]>([])
  const activeRef = useRef<Point[] | null>(null)
  const lessonRef = useRef<string[]>([])
  const [hasLesson, setHasLesson] = useState(false)
  const [inked, setInked] = useState(false)

  function redraw() {
    const canvas = canvasRef.current
    if (!canvas) return
    paint(canvas, strokesRef.current, activeRef.current, lessonRef.current)
  }

  function clearInk() {
    strokesRef.current = []
    activeRef.current = null
    setInked(false)
    redraw()
  }

  handle.current = {
    exportImage() {
      const canvas = canvasRef.current
      if (!canvas || strokesRef.current.length === 0) return null
      const scale = Math.min(1, 1280 / canvas.width)
      const copy = document.createElement('canvas')
      copy.width = Math.max(1, Math.round(canvas.width * scale))
      copy.height = Math.max(1, Math.round(canvas.height * scale))
      const context = copy.getContext('2d')
      if (!context) return null
      context.drawImage(canvas, 0, 0, copy.width, copy.height)
      return copy.toDataURL('image/jpeg', 0.72)
    },
    clear() {
      clearInk()
    },
    setLesson(lines) {
      lessonRef.current = lines.slice(0, 6)
      strokesRef.current = []
      activeRef.current = null
      setHasLesson(lessonRef.current.length > 0)
      setInked(false)
      redraw()
    },
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    redraw()
    const observer = new ResizeObserver(() => redraw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }

  return (
    <div className="classroom-board">
      <canvas
        ref={canvasRef}
        aria-label={prompt || dictionary.classroom.board}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          activeRef.current = [point(event)]
          redraw()
        }}
        onPointerMove={(event) => {
          if (!activeRef.current) return
          activeRef.current.push(point(event))
          redraw()
        }}
        onPointerUp={(event) => {
          const stroke = activeRef.current
          activeRef.current = null
          if (stroke && stroke.length > 0) {
            strokesRef.current.push(stroke)
            setInked(true)
            onInk?.()
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          redraw()
        }}
        onPointerCancel={() => {
          activeRef.current = null
          redraw()
        }}
      />
      {prompt ? (
        <p className={hasLesson ? 'classroom-board-hint is-below' : 'classroom-board-hint'} hidden={inked}>
          {prompt}
        </p>
      ) : null}
      <button
        type="button"
        className="classroom-clear"
        onClick={clearInk}
      >
        {dictionary.classroom.clear}
      </button>
    </div>
  )
}
