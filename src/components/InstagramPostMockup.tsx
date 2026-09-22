import { useEffect, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import type { PostType } from '../types'

export interface MockupMediaItem {
  url: string
  type: 'imagem' | 'video'
  posterUrl?: string
}

interface InstagramPostMockupProps {
  handle: string
  avatarUrl?: string | null
  media: MockupMediaItem[]
  caption?: string | null
  postType: PostType
}

const SWIPE_THRESHOLD = 50
const DEFAULT_RATIO = 4 / 5
// Instagram feed posts never crop: photos/videos are shown in their real ratio,
// clamped between a tall portrait (Reels/Stories, 9:16) and a wide landscape (1.91:1).
const MIN_RATIO = 9 / 16
const MAX_RATIO = 1.91
const DEFAULT_CARD_WIDTH = 448 // matches Tailwind's max-w-md
// Approx. space taken by the header, action icons, caption and surrounding page/modal padding.
const CHROME_HEIGHT = 260
const SIDE_MARGIN = 32

function clampRatio(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_RATIO
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    function onResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}

export function InstagramPostMockup({ handle, avatarUrl, media, caption, postType }: InstagramPostMockupProps) {
  const [index, setIndex] = useState(0)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const [mediaRatio, setMediaRatio] = useState(DEFAULT_RATIO)
  const viewport = useViewportSize()

  const hasMedia = media.length > 0
  const current = media[index]
  const isCarousel = media.length > 1
  const swipeable = isCarousel && current?.type !== 'video'
  const isDragging = dragStartX !== null

  const availableHeight = Math.max(200, viewport.height - CHROME_HEIGHT)
  const availableWidth = Math.max(240, viewport.width - SIDE_MARGIN)
  const cardWidth = Math.min(DEFAULT_CARD_WIDTH, availableWidth, availableHeight * mediaRatio)

  useEffect(() => {
    setMediaRatio(DEFAULT_RATIO)
  }, [current?.url])

  function handleImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) setMediaRatio(clampRatio(img.naturalWidth / img.naturalHeight))
  }

  function handleVideoMetadata(e: SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget
    if (video.videoWidth && video.videoHeight) setMediaRatio(clampRatio(video.videoWidth / video.videoHeight))
  }

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(media.length - 1, next)))
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeable) return
    setDragStartX(e.clientX)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartX === null) return
    setDragX(e.clientX - dragStartX)
  }

  function endDrag() {
    if (dragStartX === null) return
    if (dragX <= -SWIPE_THRESHOLD) goTo(index + 1)
    else if (dragX >= SWIPE_THRESHOLD) goTo(index - 1)
    setDragStartX(null)
    setDragX(0)
  }

  return (
    <div
      className="mx-auto overflow-hidden rounded-lg border border-gray-200 bg-white text-base shadow-sm"
      style={{ width: cardWidth }}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
          <div className="h-full w-full overflow-hidden rounded-full bg-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt={handle} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-200 text-xs text-gray-500">
                {handle.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <span className="font-semibold text-gray-900">{handle}</span>
      </div>

      <div
        className="relative w-full touch-pan-y select-none overflow-hidden bg-gray-100"
        style={{ touchAction: 'pan-y', aspectRatio: hasMedia ? mediaRatio : DEFAULT_RATIO }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {hasMedia ? (
          <>
            <div
              className="h-full w-full"
              style={{
                transform: `translateX(${dragX}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
              }}
            >
              {current.type === 'video' ? (
                <video
                  key={current.url}
                  src={current.url}
                  poster={current.posterUrl}
                  onLoadedMetadata={handleVideoMetadata}
                  controls
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={current.url}
                  alt=""
                  draggable={false}
                  onLoad={handleImageLoad}
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            {isCarousel && (
              <>
                {index > 0 && (
                  <button
                    type="button"
                    aria-label="Anterior"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => goTo(index - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow"
                  >
                    <ChevronIcon direction="left" />
                  </button>
                )}
                {index < media.length - 1 && (
                  <button
                    type="button"
                    aria-label="Próxima"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => goTo(index + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow"
                  >
                    <ChevronIcon direction="right" />
                  </button>
                )}
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {media.map((m, i) => (
                    <span
                      key={m.url + i}
                      className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-blue-500' : 'bg-white/70'}`}
                    />
                  ))}
                </div>
                <span className="absolute right-2 top-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                  {index + 1}/{media.length}
                </span>
              </>
            )}
            {postType === 'reels' && (
              <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                Reels
              </span>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">Sem mídia</div>
        )}
      </div>

      <div className="flex items-center gap-4 p-4 text-gray-800">
        <HeartIcon />
        <CommentIcon />
        <SendIcon />
        <div className="flex-1" />
        <BookmarkIcon />
      </div>

      {caption && (
        <p className="px-4 pb-4 text-gray-800">
          <span className="font-semibold text-gray-900">{handle}</span> {caption}
        </p>
      )}
    </div>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="black"
      strokeWidth={2}
      className={`h-4 w-4 ${direction === 'left' ? '' : 'rotate-180'}`}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.5 4.5 3 1-1.5 2.5-3 4.5-3 3.5 0 6 3.5 4 7.5C19 16.65 12 21 12 21z"
      />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 11.5a8.5 8.5 0 01-8.5 8.5H4l1.6-4A8.5 8.5 0 1121 11.5z"
      />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-6-4-6 4V3z" />
    </svg>
  )
}
