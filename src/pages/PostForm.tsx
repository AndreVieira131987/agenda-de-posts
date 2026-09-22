import imageCompression from 'browser-image-compression'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { InstagramPostMockup } from '../components/InstagramPostMockup'
import { getMediaPublicUrl, MEDIA_BUCKET, removeStorageObjects, sanitizeFileName, supabase } from '../lib/supabaseClient'
import type { Client, Post, PostMedia, PostStatus, PostType } from '../types'
import { captureVideoThumbnail } from '../lib/videoThumbnail'

interface MediaSlot {
  id: string
  kind: 'existing' | 'new'
  existing?: PostMedia
  file?: File
  previewUrl: string
  fullUrl: string
}

const MULTI_TYPES: PostType[] = ['carrossel']
const MAX_VIDEO_SIZE_MB = 60

function isVideoSlot(slot: MediaSlot): boolean {
  if (slot.kind === 'existing') return slot.existing?.media_type === 'video'
  return slot.file?.type.startsWith('video/') ?? false
}

export function PostForm() {
  const { clientId, postId } = useParams<{ clientId: string; postId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isEditing = Boolean(postId)

  const [client, setClient] = useState<Client | null>(null)
  const [postType, setPostType] = useState<PostType>('imagem')
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState<PostStatus>('rascunho')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const dateParam = searchParams.get('data')
    return dateParam ? `${dateParam}T12:00` : ''
  })
  const [slots, setSlots] = useState<MediaSlot[]>([])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draggedSlotId = useRef<string | null>(null)

  const allowMultiple = MULTI_TYPES.includes(postType)
  const allowVideo = postType === 'video' || postType === 'reels'

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
    if (!postId) return
    supabase
      .from('posts')
      .select('*, post_media(*)')
      .eq('id', postId)
      .single()
      .then(({ data }) => {
        if (!data) {
          setLoading(false)
          return
        }
        const post = data as Post
        setPostType(post.post_type)
        setCaption(post.caption ?? '')
        setStatus(post.status)
        setScheduledAt(post.scheduled_at ? toLocalInputValue(post.scheduled_at) : '')
        const media = (post.post_media ?? []).sort((a, b) => a.position - b.position)
        setSlots(
          media.map((m) => ({
            id: m.id,
            kind: 'existing',
            existing: m,
            previewUrl: getMediaPublicUrl(m.thumbnail_path ?? m.storage_path),
            fullUrl: getMediaPublicUrl(m.storage_path),
          })),
        )
        if ((post.post_type === 'video' || post.post_type === 'reels') && media[0]?.thumbnail_path) {
          setCoverPreviewUrl(getMediaPublicUrl(media[0].thumbnail_path))
        }
        setLoading(false)
      })
  }, [postId])

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const newSlots: MediaSlot[] = files.map((file) => {
      const objectUrl = URL.createObjectURL(file)
      return {
        id: crypto.randomUUID(),
        kind: 'new',
        file,
        previewUrl: objectUrl,
        fullUrl: objectUrl,
      }
    })

    setSlots((prev) => (allowMultiple ? [...prev, ...newSlots] : newSlots))
    e.target.value = ''
  }

  function handleCoverSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreviewUrl(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }

  function moveSlot(id: string, direction: -1 | 1) {
    setSlots((prev) => {
      const index = prev.findIndex((s) => s.id === id)
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  function reorderSlot(draggedId: string, overId: string) {
    if (draggedId === overId) return
    setSlots((prev) => {
      const from = prev.findIndex((s) => s.id === draggedId)
      const to = prev.findIndex((s) => s.id === overId)
      if (from === -1 || to === -1) return prev
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!clientId) return
    setSaving(true)
    setError(null)

    try {
      const postPayload = {
        client_id: clientId,
        caption: caption.trim() || null,
        post_type: postType,
        status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }

      let currentPostId = postId

      if (isEditing && currentPostId) {
        const { error } = await supabase.from('posts').update(postPayload).eq('id', currentPostId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('posts').insert(postPayload).select('id').single()
        if (error) throw error
        currentPostId = data.id
      }

      const removedExisting = isEditing ? await getRemovedExistingMedia(currentPostId!, slots) : []
      if (removedExisting.length > 0) {
        await removeStorageObjects(removedExisting.flatMap((m) => [m.storage_path, m.thumbnail_path]))
        await supabase
          .from('post_media')
          .delete()
          .in(
            'id',
            removedExisting.map((m) => m.id),
          )
      }

      async function uploadCover(i: number): Promise<string | null> {
        if (!coverFile) return null
        const compressedCover = await imageCompression(coverFile, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1080,
          useWebWorker: true,
        })
        const coverPath = `${clientId}/${currentPostId}/${Date.now()}-${i}-cover.jpg`
        const { error: coverError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(coverPath, compressedCover, { upsert: false })
        if (coverError) throw coverError
        return coverPath
      }

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]
        if (slot.kind === 'existing' && slot.existing) {
          const updates: { position: number; thumbnail_path?: string } = { position: i }
          if (allowVideo && slot.existing.media_type === 'video' && coverFile) {
            const coverPath = await uploadCover(i)
            if (coverPath) {
              updates.thumbnail_path = coverPath
              if (slot.existing.thumbnail_path) await removeStorageObjects([slot.existing.thumbnail_path])
            }
          }
          await supabase.from('post_media').update(updates).eq('id', slot.existing.id)
          continue
        }

        if (slot.kind === 'new' && slot.file) {
          const file = slot.file
          const isVideo = file.type.startsWith('video/')

          if (isVideo) {
            if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
              throw new Error(`Vídeo muito grande (máx. ${MAX_VIDEO_SIZE_MB}MB). Comprima antes de subir.`)
            }

            const path = `${clientId}/${currentPostId}/${Date.now()}-${i}-${sanitizeFileName(file.name)}`
            const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
              upsert: false,
            })
            if (uploadError) throw uploadError

            let thumbnailPath = await uploadCover(i)
            if (!thumbnailPath) {
              try {
                const thumbnailBlob = await captureVideoThumbnail(file)
                thumbnailPath = `${clientId}/${currentPostId}/${Date.now()}-${i}-thumb.jpg`
                const { error: thumbError } = await supabase.storage
                  .from(MEDIA_BUCKET)
                  .upload(thumbnailPath, thumbnailBlob, { upsert: false })
                if (thumbError) thumbnailPath = null
              } catch {
                thumbnailPath = null
              }
            }

            await supabase.from('post_media').insert({
              post_id: currentPostId,
              media_type: 'video',
              storage_path: path,
              thumbnail_path: thumbnailPath,
              position: i,
            })
          } else {
            const compressed = await imageCompression(file, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
            })
            const path = `${clientId}/${currentPostId}/${Date.now()}-${i}-${sanitizeFileName(file.name)}`
            const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, compressed, {
              upsert: false,
            })
            if (uploadError) throw uploadError

            await supabase.from('post_media').insert({
              post_id: currentPostId,
              media_type: 'imagem',
              storage_path: path,
              position: i,
            })
          }
        }
      }

      navigate(`/clientes/${clientId}/calendario`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar o post.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <p className="text-sm text-dark/60">Carregando...</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <Link to={`/clientes/${clientId}/calendario`} className="mb-4 inline-block text-xs text-dark/50 hover:text-brand">
        ← Voltar ao calendário
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="rounded-xl border border-secondary/30 bg-white p-6 shadow-sm">
          <h1 className="mb-4 font-serif text-xl font-semibold text-dark">{isEditing ? 'Editar post' : 'Novo post'}</h1>

          <label className="mb-1 block text-sm font-medium text-dark/80">Tipo de post</label>
          <select
            value={postType}
            onChange={(e) => setPostType(e.target.value as PostType)}
            className="mb-4 w-full rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            <option value="imagem">Imagem</option>
            <option value="carrossel">Carrossel</option>
            <option value="video">Vídeo</option>
            <option value="reels">Reels</option>
            <option value="story">Story</option>
          </select>

          <label className="mb-1 block text-sm font-medium text-dark/80">
            {allowVideo ? 'Vídeo (ou imagem de capa)' : 'Imagens'}
          </label>
          <label className="mb-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-secondary/50 px-4 py-6 text-center hover:border-brand hover:bg-brand/5">
            <span className="text-sm font-medium text-brand">
              Clique para escolher {allowVideo ? 'um vídeo ou imagem' : allowMultiple ? 'imagens' : 'uma imagem'}
            </span>
            <span className="mt-1 text-xs text-dark/50">{allowVideo ? `JPG, PNG ou MP4 (até ${MAX_VIDEO_SIZE_MB}MB)` : 'JPG ou PNG'}</span>
            <input
              type="file"
              accept={allowVideo ? 'image/*,video/*' : 'image/*'}
              multiple={allowMultiple}
              onChange={handleFilesSelected}
              className="hidden"
            />
          </label>
          {allowVideo && (
            <>
              <p className="mb-2 text-xs text-dark/50">
                Prefira vídeos curtos e já comprimidos — eles ocupam o espaço gratuito do Supabase mais rápido que imagens.
              </p>

              <label className="mb-1 block text-sm font-medium text-dark/80">Capa (opcional)</label>
              <div className="mb-2 flex items-center gap-3">
                {coverPreviewUrl && (
                  <img
                    src={coverPreviewUrl}
                    alt="Capa"
                    className="h-14 w-14 shrink-0 rounded border border-secondary/40 object-cover"
                  />
                )}
                <label className="cursor-pointer rounded-lg border border-dashed border-secondary/50 px-3 py-2 text-xs font-medium text-brand hover:border-brand hover:bg-brand/5">
                  {coverPreviewUrl ? 'Trocar capa' : 'Escolher capa'}
                  <input type="file" accept="image/*" onChange={handleCoverSelected} className="hidden" />
                </label>
              </div>
              <p className="mb-2 text-xs text-dark/50">
                Se não escolher uma capa, geramos uma automaticamente a partir do primeiro frame do vídeo.
              </p>
            </>
          )}

          {slots.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {slots.map((slot, i) => (
                <div
                  key={slot.id}
                  draggable={allowMultiple}
                  onDragStart={() => {
                    draggedSlotId.current = slot.id
                  }}
                  onDragOver={(e) => {
                    if (!allowMultiple) return
                    e.preventDefault()
                    if (draggedSlotId.current) reorderSlot(draggedSlotId.current, slot.id)
                  }}
                  onDragEnd={() => {
                    draggedSlotId.current = null
                  }}
                  className={`relative h-16 w-16 overflow-hidden rounded border border-secondary/40 ${allowMultiple ? 'cursor-move' : ''}`}
                >
                  {slot.kind === 'new' && isVideoSlot(slot) ? (
                    <video src={slot.previewUrl} muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <img src={slot.previewUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.id)}
                    className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-[10px] text-white"
                  >
                    ×
                  </button>
                  {allowMultiple && slots.length > 1 && (
                    <div className="absolute bottom-0 flex w-full justify-between bg-black/40 text-[10px] text-white">
                      <button type="button" disabled={i === 0} onClick={() => moveSlot(slot.id, -1)} className="px-1 disabled:opacity-30">
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={i === slots.length - 1}
                        onClick={() => moveSlot(slot.id, 1)}
                        className="px-1 disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {allowMultiple && slots.length > 1 && (
                <p className="w-full text-xs text-dark/40">Arraste as imagens para reordenar o carrossel.</p>
              )}
            </div>
          )}

          <label className="mb-1 block text-sm font-medium text-dark/80">Legenda</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="mb-4 w-full rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />

          <label className="mb-1 block text-sm font-medium text-dark/80">Data e hora planejada</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="mb-4 w-full rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />

          <label className="mb-1 block text-sm font-medium text-dark/80">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PostStatus)}
            className="mb-4 w-full rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            <option value="rascunho">Rascunho</option>
            <option value="pronto">Pronto</option>
            <option value="agendado">Agendado</option>
            <option value="publicado">Publicado</option>
          </select>
          <p className="mb-4 text-xs text-dark/50">
            Só posts com status "Agendado" ou "Publicado" aparecem no link público do cliente.
          </p>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar post'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-2">
          <p className="self-start font-display text-sm font-medium uppercase tracking-wide text-dark/70">Pré-visualização</p>
          <InstagramPostMockup
            handle={client?.instagram_handle ?? client?.name ?? 'cliente'}
            avatarUrl={client?.avatar_url}
            postType={postType}
            caption={caption}
            media={slots.map((s) => ({
              url: s.fullUrl,
              type: isVideoSlot(s) ? 'video' : 'imagem',
              posterUrl: isVideoSlot(s) ? (coverPreviewUrl ?? undefined) : undefined,
            }))}
          />
        </div>
      </div>
    </AppLayout>
  )
}

async function getRemovedExistingMedia(postId: string, slots: MediaSlot[]) {
  const keptIds = new Set(slots.filter((s) => s.kind === 'existing').map((s) => s.existing!.id))
  const { data } = await supabase.from('post_media').select('id, storage_path, thumbnail_path').eq('post_id', postId)
  return (data ?? []).filter((m) => !keptIds.has(m.id))
}

function toLocalInputValue(isoDate: string) {
  const date = new Date(isoDate)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
