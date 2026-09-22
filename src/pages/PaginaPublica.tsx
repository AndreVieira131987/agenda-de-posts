import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { InstagramPostMockup } from '../components/InstagramPostMockup'
import { getMediaPublicUrl, supabase } from '../lib/supabaseClient'
import { POST_TYPE_LABEL, type PostType } from '../types'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface PublicClient {
  id: string
  name: string
  avatar_url: string | null
  instagram_handle: string | null
}

interface PublicMedia {
  id: string
  media_type: 'imagem' | 'video'
  storage_path: string
  thumbnail_path: string | null
  position: number
}

interface PublicPost {
  id: string
  caption: string | null
  post_type: string
  network: string
  status: string
  scheduled_at: string | null
  order_index: number
  media: PublicMedia[]
}

export function PaginaPublica() {
  const { token } = useParams<{ token: string }>()
  const [client, setClient] = useState<PublicClient | null>(null)
  const [posts, setPosts] = useState<PublicPost[]>([])
  const [month, setMonth] = useState(new Date())
  const [selectedPost, setSelectedPost] = useState<PublicPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const [{ data: clientRows }, { data: postRows }] = await Promise.all([
        supabase.rpc('get_client_by_token', { p_token: token }),
        supabase.rpc('get_posts_by_token', { p_token: token }),
      ])

      if (cancelled) return

      const clientRow = clientRows?.[0] ?? null
      if (!clientRow) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setClient(clientRow)
      setPosts(postRows ?? [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd])

  function postsForDay(day: Date) {
    return posts.filter((p) => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day))
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-light text-dark/60">Carregando...</div>
  }

  if (notFound || !client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-light px-4 text-center text-dark/60">
        Link inválido ou expirado. Peça um novo link para quem enviou este.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-secondary/30">
            {client.avatar_url && <img src={client.avatar_url} alt={client.name} className="h-full w-full object-cover" />}
          </div>
          <div>
            <h1 className="font-serif text-xl font-semibold text-dark">{client.name}</h1>
            <p className="text-sm text-dark/50">{client.instagram_handle}</p>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded-lg border border-secondary/50 bg-white px-3 py-1.5 text-sm text-dark/80 hover:bg-white/60"
          >
            ← Mês anterior
          </button>
          <span className="font-display text-sm font-medium uppercase tracking-wide text-dark">
            {format(month, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded-lg border border-secondary/50 bg-white px-3 py-1.5 text-sm text-dark/80 hover:bg-white/60"
          >
            Próximo mês →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-secondary/30 bg-secondary/30 text-xs">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="bg-white p-2 text-center font-medium text-dark/50">
              {wd}
            </div>
          ))}

          {days.map((day) => {
            const dayPosts = postsForDay(day)
            const inMonth = isSameMonth(day, month)
            return (
              <div key={day.toISOString()} className={`flex min-h-28 flex-col items-center gap-1 bg-white p-1.5 ${inMonth ? '' : 'opacity-40'}`}>
                <span className={`self-start text-[11px] ${isToday(day) ? 'font-bold text-brand' : 'text-dark/50'}`}>
                  {format(day, 'd')}
                </span>
                <div className="flex flex-1 flex-wrap content-start justify-center gap-1">
                  {dayPosts.map((post) => {
                    const firstMedia = [...post.media].sort((a, b) => a.position - b.position)[0]
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setSelectedPost(post)}
                        title={post.caption ?? POST_TYPE_LABEL[post.post_type as keyof typeof POST_TYPE_LABEL] ?? post.post_type}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 border-brand/30 hover:ring-2 hover:ring-brand"
                      >
                        {firstMedia ? (
                          <img
                            src={getMediaPublicUrl(firstMedia.thumbnail_path ?? firstMedia.storage_path)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-brand/10 text-xs text-brand">
                            {(POST_TYPE_LABEL[post.post_type as keyof typeof POST_TYPE_LABEL] ?? post.post_type)[0]}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {posts.length === 0 && (
          <p className="mt-6 text-center text-sm text-dark/50">Nenhum post agendado ainda neste período.</p>
        )}
      </div>

      {selectedPost && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-dark/40 px-4"
          onClick={() => setSelectedPost(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <InstagramPostMockup
              handle={client.instagram_handle ?? client.name}
              avatarUrl={client.avatar_url}
              postType={selectedPost.post_type as PostType}
              caption={selectedPost.caption}
              media={selectedPost.media
                .sort((a, b) => a.position - b.position)
                .map((m) => ({
                  url: getMediaPublicUrl(m.storage_path),
                  type: m.media_type,
                  posterUrl: m.thumbnail_path ? getMediaPublicUrl(m.thumbnail_path) : undefined,
                }))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
