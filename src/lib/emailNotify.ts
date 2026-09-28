import emailjs from '@emailjs/browser'

interface NotifyPostFeedbackParams {
  clientName: string
  respondentName: string
  actionLabel: string
  postCaption: string
  postDate: string
  message?: string | null
}

export async function notifyPostFeedback(params: NotifyPostFeedbackParams) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  const toEmail = import.meta.env.VITE_NOTIFY_EMAIL

  if (!serviceId || !templateId || !publicKey || !toEmail) {
    console.warn('EmailJS não configurado — notificação por e-mail não enviada.')
    return
  }

  try {
    await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: toEmail,
        client_name: params.clientName,
        respondent_name: params.respondentName,
        action_label: params.actionLabel,
        post_caption: params.postCaption,
        post_date: params.postDate,
        message: params.message ?? '',
      },
      { publicKey },
    )
  } catch (err) {
    console.warn('Falha ao enviar notificação por e-mail (a resposta já foi salva normalmente):', err)
  }
}
