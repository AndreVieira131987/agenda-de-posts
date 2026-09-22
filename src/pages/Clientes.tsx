import imageCompression from 'browser-image-compression'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../context/AuthContext'
import {
  getMediaPublicUrl,
  getStoragePathFromPublicUrl,
  MEDIA_BUCKET,
  removeStorageObjects,
  sanitizeFileName,
  supabase,
} from '../lib/supabaseClient'
import type { Client } from '../types'

export function Clientes() {
  const { session } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [postCounts, setPostCounts] = useState<Record<string, number>>({})
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function loadClients() {
    setLoading(true)
    const { data: clientsData } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    setClients(clientsData ?? [])

    if (clientsData && clientsData.length > 0) {
      const { data: postsData } = await supabase
        .from('posts')
        .select('client_id')
        .in(
          'client_id',
          clientsData.map((c) => c.id),
        )

      const counts: Record<string, number> = {}
      for (const p of postsData ?? []) {
        counts[p.client_id] = (counts[p.client_id] ?? 0) + 1
      }
      setPostCounts(counts)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadClients()
  }, [])

  async function handleDelete(client: Client) {
    if (!confirm(`Excluir "${client.name}" e todos os posts dele(a)? Essa ação não pode ser desfeita.`)) return

    const { data: postRows } = await supabase.from('posts').select('id').eq('client_id', client.id)
    const postIds = (postRows ?? []).map((p) => p.id)

    const mediaPaths: (string | null)[] = []
    if (postIds.length > 0) {
      const { data: mediaRows } = await supabase
        .from('post_media')
        .select('storage_path, thumbnail_path')
        .in('post_id', postIds)
      for (const m of mediaRows ?? []) mediaPaths.push(m.storage_path, m.thumbnail_path)
    }
    if (client.avatar_url) mediaPaths.push(getStoragePathFromPublicUrl(client.avatar_url))

    await removeStorageObjects(mediaPaths)
    await supabase.from('clients').delete().eq('id', client.id)
    loadClients()
  }

  function copyPublicLink(client: Client) {
    const url = `${window.location.origin}/p/${client.public_token}`
    navigator.clipboard.writeText(url)
    setCopiedId(client.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function regenerateLink(client: Client) {
    if (!confirm('Gerar um novo link para este cliente? O link antigo deixará de funcionar.')) return
    await supabase.from('clients').update({ public_token: crypto.randomUUID() }).eq('id', client.id)
    loadClients()
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-dark">Clientes</h1>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Novo cliente
        </button>
      </div>

      {loading && <p className="text-sm text-dark/60">Carregando...</p>}

      {!loading && clients.length === 0 && (
        <p className="text-sm text-dark/60">Nenhum cliente ainda. Crie o primeiro para começar a planejar posts.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <div key={client.id} className="rounded-xl border border-secondary/30 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-light">
                {client.avatar_url && (
                  <img src={client.avatar_url} alt={client.name} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-dark">{client.name}</p>
                <p className="truncate text-xs text-dark/50">{client.instagram_handle ?? 'sem @'}</p>
              </div>
            </div>

            <p className="mb-3 text-xs text-dark/50">{postCounts[client.id] ?? 0} post(s) planejado(s)</p>

            <div className="flex flex-wrap gap-2">
              <Link
                to={`/clientes/${client.id}/calendario`}
                className="rounded-lg bg-dark px-3 py-1.5 text-xs font-medium text-white hover:bg-dark/80"
              >
                Ver calendário
              </Link>
              <button
                type="button"
                onClick={() => copyPublicLink(client)}
                className="rounded-lg border border-secondary/50 px-3 py-1.5 text-xs font-medium text-dark/80 hover:bg-light"
              >
                {copiedId === client.id ? 'Link copiado!' : 'Copiar link público'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(client)
                  setShowForm(true)
                }}
                className="rounded-lg border border-secondary/50 px-3 py-1.5 text-xs font-medium text-dark/80 hover:bg-light"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => regenerateLink(client)}
                className="rounded-lg border border-secondary/50 px-3 py-1.5 text-xs font-medium text-dark/80 hover:bg-light"
              >
                Gerar novo link
              </button>
              <button
                type="button"
                onClick={() => handleDelete(client)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <ClientFormModal
          client={editing}
          ownerId={session!.user.id}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            loadClients()
          }}
        />
      )}
    </AppLayout>
  )
}

function ClientFormModal({
  client,
  ownerId,
  onClose,
  onSaved,
}: {
  client: Client | null
  ownerId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(client?.name ?? '')
  const [handle, setHandle] = useState(client?.instagram_handle ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(client?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleAvatarSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreviewUrl(URL.createObjectURL(file))
    e.target.value = ''
  }

  function handleRemoveAvatar() {
    setAvatarFile(null)
    setAvatarPreviewUrl('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const basePayload = {
        name: name.trim(),
        instagram_handle: handle.trim() || null,
      }

      let clientId = client?.id

      if (clientId) {
        const { error } = await supabase.from('clients').update(basePayload).eq('id', clientId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert({ ...basePayload, owner_id: ownerId })
          .select('id')
          .single()
        if (error) throw error
        clientId = data.id
      }

      if (avatarFile) {
        const compressed = await imageCompression(avatarFile, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 512,
          useWebWorker: true,
        })
        const path = `${clientId}/avatar/${Date.now()}-${sanitizeFileName(avatarFile.name)}`
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, compressed, {
          upsert: false,
        })
        if (uploadError) throw uploadError
        await supabase.from('clients').update({ avatar_url: getMediaPublicUrl(path) }).eq('id', clientId)
        if (client?.avatar_url) await removeStorageObjects([getStoragePathFromPublicUrl(client.avatar_url)])
      } else if (!avatarPreviewUrl && client?.avatar_url) {
        await supabase.from('clients').update({ avatar_url: null }).eq('id', clientId)
        await removeStorageObjects([getStoragePathFromPublicUrl(client.avatar_url)])
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-dark/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 font-serif text-lg font-semibold text-dark">{client ? 'Editar cliente' : 'Novo cliente'}</h2>

        <label className="mb-1 block text-sm font-medium text-dark/80">Nome</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-dark/80">@ do Instagram</label>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@usuario"
          className="mb-4 w-full rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-dark/80">Foto de perfil (opcional)</label>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-secondary/40 bg-light">
            {avatarPreviewUrl && <img src={avatarPreviewUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <label className="cursor-pointer rounded-lg border border-dashed border-secondary/50 px-3 py-2 text-xs font-medium text-brand hover:border-brand hover:bg-brand/5">
            {avatarPreviewUrl ? 'Trocar foto' : 'Escolher foto'}
            <input type="file" accept="image/*" onChange={handleAvatarSelected} className="hidden" />
          </label>
          {avatarPreviewUrl && (
            <button type="button" onClick={handleRemoveAvatar} className="text-xs text-red-600 hover:underline">
              Remover
            </button>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-secondary/50 px-4 py-2 text-sm font-medium text-dark/80 hover:bg-light"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
