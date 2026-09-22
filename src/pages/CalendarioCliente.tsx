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
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { getMediaPublicUrl, removeStorageObjects, supabase } from '../lib/supabaseClient'
import { POST_TYPE_LABEL, STATUS_COLOR, STATUS_LABEL, type Client, type Post } from '../types'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarioCliente() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<Client | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [month, setMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()
      .then(({ data }) => setClient(data))
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    setLoading(true)
    supabase
      .from('posts')
      .select('*, post_media(*)')
      .eq('client_id', clientId)
      .gte('scheduled_at', gridStart.toISOString())
      .lte('scheduled_at', gridEnd.toISOString())
      .order('scheduled_at', { ascending: true })
      .then(({ data }) => {
        setPosts(data ?? [])
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, month])

  function postsForDay(day: Date) {
    return posts.filter((p) => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day))
  }

  async function handleDeletePost(post: Post) {
    if (!confirm('Excluir este post?')) return
    const paths = (post.post_media ?? []).flatMap((m) => [m.storage_path, m.thumbnail_path])
    await removeStorageObjects(paths)
    await supabase.from('posts').delete().eq('id', post.id)
    setPosts((prev) => prev.filter((p) => p.id !== post.id))
  }

  if (!client && !loading) {
    return (
      <AppLayout>
        <p className="text-sm text-dark/60">Cliente não encontrado.</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link to="/clientes" className="text-xs text-dark/50 hover:text-brand">
            ← Clientes
          </Link>
          <h1 className="font-serif text-2xl font-semibold text-dark">{client?.name ?? 'Carregando...'}</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/clientes/${clientId}/posts/novo`)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo post
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="rounded-lg border border-secondary/50 px-3 py-1.5 text-sm text-dark/80 hover:bg-light"
        >
          ← Mês anterior
        </button>
        <span className="font-display text-sm font-medium uppercase tracking-wide text-dark">
          {format(month, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="rounded-lg border border-secondary/50 px-3 py-1.5 text-sm text-dark/80 hover:bg-light"
        >
          Próximo mês →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-secondary/30 bg-secondary/30 text-xs">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="bg-light p-2 text-center font-medium text-dark/50">
            {wd}
          </div>
        ))}

        {days.map((day) => {
          const dayPosts = postsForDay(day)
          const inMonth = isSameMonth(day, month)
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`flex min-h-28 flex-col items-center gap-1 bg-white p-1.5 text-left align-top hover:bg-brand/5 ${
                inMonth ? '' : 'opacity-40'
              }`}
            >
              <span className={`self-start text-[11px] ${isToday(day) ? 'font-bold text-brand' : 'text-dark/50'}`}>
                {format(day, 'd')}
              </span>
              {dayPosts.length > 0 && (
                <div
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${STATUS_COLOR[dayPosts[0].status]}`}
                  title={dayPosts[0].caption ?? POST_TYPE_LABEL[dayPosts[0].post_type]}
                >
                  {dayPosts[0].post_media?.[0] ? (
                    <img
                      src={getMediaPublicUrl(dayPosts[0].post_media[0].thumbnail_path ?? dayPosts[0].post_media[0].storage_path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs">
                      {POST_TYPE_LABEL[dayPosts[0].post_type][0]}
                    </div>
                  )}
                  {dayPosts.length > 1 && (
                    <span className="absolute bottom-0 right-0 rounded-tl bg-dark/80 px-1 text-[10px] font-medium text-white">
                      +{dayPosts.length - 1}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          posts={postsForDay(selectedDay)}
          onClose={() => setSelectedDay(null)}
          onAdd={() => navigate(`/clientes/${clientId}/posts/novo?data=${format(selectedDay, 'yyyy-MM-dd')}`)}
          onEdit={(post) => navigate(`/clientes/${clientId}/posts/${post.id}/editar`)}
          onDelete={handleDeletePost}
        />
      )}
    </AppLayout>
  )
}

function DayDetailModal({
  day,
  posts,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: {
  day: Date
  posts: Post[]
  onClose: () => void
  onAdd: () => void
  onEdit: (post: Post) => void
  onDelete: (post: Post) => void
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-dark/40 px-4">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold capitalize text-dark">
            {format(day, "d 'de' MMMM", { locale: ptBR })}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-dark/50 hover:text-brand">
            Fechar
          </button>
        </div>

        {posts.length === 0 && <p className="mb-4 text-sm text-dark/60">Nenhum post planejado neste dia.</p>}

        <div className="mb-4 flex flex-col gap-2">
          {posts.map((post) => {
            const firstMedia = post.post_media?.[0]
            return (
              <div key={post.id} className="flex items-center gap-3 rounded-lg border border-secondary/30 p-2">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-light">
                  {firstMedia && (
                    <img
                      src={getMediaPublicUrl(firstMedia.storage_path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-dark">{post.caption || POST_TYPE_LABEL[post.post_type]}</p>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[post.status]}`}>
                    {STATUS_LABEL[post.status]}
                  </span>
                </div>
                <button type="button" onClick={() => onEdit(post)} className="text-xs text-brand hover:underline">
                  Editar
                </button>
                <button type="button" onClick={() => onDelete(post)} className="text-xs text-red-600 hover:underline">
                  Excluir
                </button>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo post neste dia
        </button>
      </div>
    </div>
  )
}
