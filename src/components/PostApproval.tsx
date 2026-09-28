import { useState } from 'react'
import { notifyPostFeedback } from '../lib/emailNotify'
import { supabase } from '../lib/supabaseClient'
import { APPROVAL_COLOR, APPROVAL_LABEL, type ApprovalStatus } from '../types'

const NAME_STORAGE_KEY = 'agenda_client_name'

interface PostApprovalProps {
  publicToken: string
  postId: string
  clientName: string
  postCaption: string | null
  postDate: string | null
  approvalStatus: ApprovalStatus
  onSubmitted: (status: ApprovalStatus) => void
}

export function PostApproval({
  publicToken,
  postId,
  clientName,
  postCaption,
  postDate,
  approvalStatus,
  onSubmitted,
}: PostApprovalProps) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? '')
  const [showForm, setShowForm] = useState(approvalStatus === 'pendente')
  const [requestingChange, setRequestingChange] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(action: 'aprovado' | 'alteracao_solicitada') {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Seu nome é obrigatório.')
      return
    }
    if (action === 'alteracao_solicitada' && !message.trim()) {
      setError('Escreva o que você gostaria de mudar.')
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('submit_post_feedback', {
      p_token: publicToken,
      p_post_id: postId,
      p_name: trimmedName,
      p_action: action,
      p_message: action === 'alteracao_solicitada' ? message.trim() : null,
    })

    setSubmitting(false)

    if (rpcError) {
      setError('Não foi possível enviar sua resposta. Tente novamente.')
      return
    }

    localStorage.setItem(NAME_STORAGE_KEY, trimmedName)
    setRequestingChange(false)
    setShowForm(false)
    onSubmitted(action)

    notifyPostFeedback({
      clientName,
      respondentName: trimmedName,
      actionLabel: action === 'aprovado' ? 'Aprovou o post' : 'Propôs uma alteração',
      postCaption: postCaption ?? '(sem legenda)',
      postDate: postDate ? new Date(postDate).toLocaleString('pt-BR') : '',
      message: action === 'alteracao_solicitada' ? message.trim() : null,
    })
  }

  return (
    <div className="border-t border-secondary/30 p-4">
      {approvalStatus !== 'pendente' && (
        <div className="mb-3 flex items-center justify-between">
          <span className={`rounded px-2 py-1 text-xs font-medium ${APPROVAL_COLOR[approvalStatus]}`}>
            {APPROVAL_LABEL[approvalStatus]}
          </span>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-xs text-brand hover:underline"
            >
              Alterar minha resposta
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-dark/80">Seu nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como você se chama?"
            className="rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />

          {requestingChange && (
            <>
              <label className="mt-1 text-sm font-medium text-dark/80">O que você gostaria de mudar?</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="rounded-lg border border-secondary/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {requestingChange ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRequestingChange(false)
                  setError(null)
                }}
                className="flex-1 rounded-lg border border-secondary/50 py-2 text-sm font-medium text-dark/80 hover:bg-light"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit('alteracao_solicitada')}
                className="flex-1 rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {submitting ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          ) : (
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit('aprovado')}
                className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                ✓ Aprovar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setRequestingChange(true)
                  setError(null)
                }}
                className="flex-1 rounded-lg border border-secondary/50 py-2 text-sm font-medium text-dark/80 hover:bg-light disabled:opacity-60"
              >
                ✏️ Propor alteração
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
