import { config } from '../config.js'

/**
 * Transactional email. Production: Resend (RESEND_API_KEY + MAIL_FROM). Development: the message
 * (with its link) is written to the server log so flows can be tested without a provider.
 */
export async function sendMail(to: string, subject: string, text: string) {
  if (!config.resendApiKey) {
    console.info(`[mail:dev] to=${to} subject="${subject}"\n${text}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to, subject, text }),
  })
  if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`)
}
