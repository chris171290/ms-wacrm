export interface AutomationEmailTemplateContext {
  contactName: string;
  contactPhone: string;
  agentName: string;
  messageText: string;
  conversationUrl: string;
}

export function interpolateEmailTemplate(
  template: string,
  context: AutomationEmailTemplateContext
): string {
  const values: Record<string, string> = {
    'contact.name': context.contactName,
    'contact.phone': context.contactPhone,
    'agent.name': context.agentName,
    'message.text': context.messageText,
    'conversation.url': context.conversationUrl,
  };

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    return values[key] ?? '';
  });
}

export function renderAutomationEmailHtml(text: string): string {
  const content = escapeHtml(text)
    .replace(/\bhttps?:\/\/[^\s<]+/gi, (url) =>
      `<a href="${url}" style="color:#6d28d9;font-weight:600;text-decoration:underline">${url}</a>`
    )
    .replace(/\r\n|\r|\n/g, '<br>');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Alerta de conversación</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:22px 28px;background-color:#7c3aed;color:#ffffff">
                <div style="font-size:20px;font-weight:700;letter-spacing:.2px">Majois Chat</div>
                <div style="margin-top:5px;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#ede9fe">Alerta de conversación</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <h1 style="margin:0 0 18px;font-size:21px;line-height:1.35;color:#111827">Conversación pendiente de respuesta</h1>
                <div style="padding:18px 20px;border:1px solid #e5e7eb;border-radius:8px;background-color:#f9fafb;font-size:15px;line-height:1.7;color:#374151">${content}</div>
                <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#6b7280">Notificación automática de Majois Chat</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
