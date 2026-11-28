import { createTransport } from 'nodemailer';

export interface SmtpMessage {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim();
  const secureValue = process.env.SMTP_SECURE;

  if (!host || !user || !password || !from) {
    throw new Error(
      'SMTP is not configured; set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM'
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number');
  }
  if (secureValue !== 'true' && secureValue !== 'false') {
    throw new Error('SMTP_SECURE must be either "true" or "false"');
  }

  return { host, port, user, password, from, secure: secureValue === 'true' };
}

export async function sendSmtpEmail(message: SmtpMessage): Promise<void> {
  const config = getSmtpConfig();
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
