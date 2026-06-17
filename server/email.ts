import { log } from "./index";
import nodemailer from "nodemailer";

const KONTAKT_EMAIL = "kontakt@formaestates.com";
const SENDER_NAME = "Forma Estates";

function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: {
      user: KONTAKT_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });
}

const transporter = createTransporter();

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  senderEmail: string;
  senderName?: string;
  replyTo?: string;
  bcc?: string;
}

async function sendBrevoEmail(options: EmailOptions) {
  if (!process.env.SMTP_PASSWORD) {
    throw new Error("SMTP_PASSWORD not configured");
  }

  await transporter.sendMail({
    from: `"${options.senderName || SENDER_NAME}" <${KONTAKT_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo || KONTAKT_EMAIL,
    bcc: options.bcc,
  });
}

export async function sendWelcomeEmail(email: string, source?: string) {
  const now = new Date();
  const timestamp = now.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });
  const sourceLabel = source || "Direkte signup (/opret)";

  try {
    await sendBrevoEmail({
      to: email,
      subject: "Velkommen til Forma Estates!",
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
            <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
            <h1 style="color:#0F1923;font-size:26px;margin:10px 0 18px;font-weight:500;">Velkommen til Forma Estates!</h1>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px;">Hej!</p>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px;">Tak for at du oprettede en konto. Vi glæder os til at hjælpe dig med at sælge dine boliger hurtigere med professionelle AI-visualiseringer.</p>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 8px;">Med Forma Estates kan du:</p>
            <ul style="color:#555;font-size:15px;line-height:2;margin:0 0 20px;padding-left:20px;">
              <li>Transformere rum med AI på sekunder</li>
              <li>Vælge mellem 8 forskellige stilarter</li>
              <li>Imponere dine boligkøbere med fotorealistiske visualiseringer</li>
            </ul>
            <p style="text-align:center;margin:28px 0;">
              <a href="https://formaestates.com/find-stil"
                 style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                Start dit første design →
              </a>
            </p>
            <p style="color:#777;font-size:13px;line-height:1.6;margin:24px 0 0;">Venlig hilsen<br/><strong style="color:#0F1923;">Forma Estates</strong></p>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark</div>
        </div>
      `,
    });
    log(`Welcome email sent to ${email}`);
  } catch (err: any) {
    log(`Failed to send welcome email to ${email}: ${err.message}`);
  }

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `Ny brugeroprettelse — ${email}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Ny bruger</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">Ny bruger oprettet</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;width:160px;border-bottom:1px solid #F0EBE1;">Email</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;"><a href="mailto:${email}" style="color:#0F1923;">${email}</a></td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Tidspunkt</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;border-bottom:1px solid #F0EBE1;">${timestamp}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;">Tilmelding via</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;">${sourceLabel}</td></tr>
            </table>
            <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">
              Forma Estates · Admin notifikation
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates</div>
        </div>
      `,
    });
    log(`Admin signup notification sent for ${email}`);
  } catch (err: any) {
    log(`Failed to send admin signup notification for ${email}: ${err.message}`);
  }
}

export async function sendOrderConfirmationEmail(data: {
  customerEmail: string;
  customerName: string;
  packageName: string;
  imageCount: number;
  price: number;
  orderId: string;
}) {
  const timestamp = new Date().toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });

  const productLabel = `${data.imageCount} AI-visualiseringer (${data.price} kr)`;

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `Nyt salg — ${data.packageName} · ${data.customerEmail}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Nyt salg</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">💳 Nyt køb gennemført</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;width:160px;border-bottom:1px solid #F0EBE1;">Email</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;"><a href="mailto:${data.customerEmail}" style="color:#0F1923;">${data.customerEmail}</a></td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Navn</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;">${data.customerName}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Pakke</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;">${data.packageName}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Produkt</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;border-bottom:1px solid #F0EBE1;">${productLabel}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Pris</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:700;border-bottom:1px solid #F0EBE1;">${data.price} kr</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Ordre-ID</td><td style="padding:10px 14px;color:#0F1923;font-size:13px;font-family:monospace;border-bottom:1px solid #F0EBE1;">${data.orderId}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;">Tidspunkt</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;">${timestamp}</td></tr>
            </table>
            <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">
              Forma Estates · Admin notifikation
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates</div>
        </div>
      `,
    });
    log(`Admin sale notification sent for order #${data.orderId} (${data.customerEmail})`);
  } catch (err: any) {
    log(`Failed to send admin sale notification: ${err.message}`);
  }
}

export async function sendContactFormEmails(data: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  teamSize?: string;
  topic?: string;
  message: string;
}) {
  const submittedAt = new Date().toLocaleString("da-DK", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });

  const row = (label: string, value?: string) =>
    value && value.trim()
      ? `<tr><td style="padding:8px 14px;color:#777;font-size:13px;width:160px;vertical-align:top;">${label}</td><td style="padding:8px 14px;color:#0F1923;font-size:14px;font-weight:500;">${value.replace(/\n/g, "<br/>")}</td></tr>`
      : "";

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `Ny kontaktforespørgsel — ${data.name}${data.company ? " · " + data.company : ""}`,
      senderEmail: KONTAKT_EMAIL,
      senderName: "Forma Estates",
      replyTo: data.email,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Ny henvendelse</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">${data.name} vil i kontakt</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${row("Navn", data.name)}
              ${row("E-mail", data.email)}
              ${row("Telefon", data.phone)}
              ${row("Firma", data.company)}
              ${row("Rolle", data.role)}
              ${row("Antal medarbejdere", data.teamSize)}
              ${row("Henvendelse handler om", data.topic)}
              ${row("Besked", data.message)}
              ${row("Modtaget", submittedAt)}
            </table>
            <div style="padding:16px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">
              Svar direkte på denne e-mail — den går til ${data.email}.
            </div>
          </div>
        </div>
      `,
    });
    log(`Contact form email sent to ${KONTAKT_EMAIL} (from ${data.email})`);
  } catch (err: any) {
    log(`Failed to send contact form admin email: ${err.message}`);
  }

  try {
    await sendBrevoEmail({
      to: data.email,
      subject: "Tak for din henvendelse — Forma Estates",
      senderEmail: KONTAKT_EMAIL,
      senderName: "Forma Estates",
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
            <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
            <h1 style="color:#0F1923;font-size:26px;margin:10px 0 18px;font-weight:500;">Tak — vi vender tilbage hurtigst muligt.</h1>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px;">Hej ${data.name.split(" ")[0]},</p>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px;">
              Vi har modtaget din besked og vender tilbage på <strong>${data.email}</strong> inden for én arbejdsdag.
              I mellemtiden er du velkommen til at se vores eksempler eller læse om, hvordan vores AI-visualisering fungerer.
            </p>
            <div style="background:#FAF6EC;border-left:3px solid #C9A96E;padding:14px 18px;margin:20px 0;border-radius:4px;">
              <div style="color:#777;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">Din besked</div>
              <div style="color:#0F1923;font-size:14px;line-height:1.55;white-space:pre-wrap;">${data.message.replace(/</g, "&lt;")}</div>
            </div>
            <p style="color:#777;font-size:13px;line-height:1.6;margin:24px 0 0;">Venlig hilsen<br/><strong style="color:#0F1923;">Forma Estates</strong></p>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark</div>
        </div>
      `,
    });
    log(`Contact form confirmation sent to ${data.email}`);
  } catch (err: any) {
    log(`Failed to send contact confirmation: ${err.message}`);
  }
}

export async function sendPasswordResetToUser(toEmail: string, name: string) {
  try {
    const loginUrl = "https://formaestates.com/log-ind";
    await sendBrevoEmail({
      to: toEmail,
      subject: "Nulstil din adgangskode – Forma Estates",
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Konto</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">Nulstil din adgangskode</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 20px;">
                Hej ${name},<br><br>
                Din administrator har anmodet om en nulstilling af din adgangskode på Forma Estates.
              </p>
              <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 24px;">
                Klik på knappen nedenfor for at gå til login-siden og vælg "Glemt adgangskode" for at oprette en ny adgangskode.
              </p>
              <p style="text-align:center;margin:28px 0;">
                <a href="${loginUrl}"
                   style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                  Gå til login →
                </a>
              </p>
              <p style="color:#999;font-size:13px;margin:24px 0 0;">Hvis du ikke har bedt om dette, kan du ignorere denne email. Din nuværende adgangskode er uændret.</p>
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark</div>
        </div>
      `,
    });
    log(`Password reset email sent to ${toEmail}`);
  } catch (err: any) {
    log(`Failed to send password reset email to ${toEmail}: ${err.message}`);
    throw err;
  }
}

export async function sendTeamInviteEmail(toEmail: string, teamName: string, inviteLink: string) {
  try {
    await sendBrevoEmail({
      to: toEmail,
      subject: `Du er inviteret til teamet "${teamName}" på Forma Estates`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Invitation</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">Du er inviteret!</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 20px;">
                Du er blevet inviteret til at blive medlem af teamet <strong style="color:#0F1923;">"${teamName}"</strong> på Forma Estates.
              </p>
              <p style="text-align:center;margin:28px 0;">
                <a href="${inviteLink}"
                   style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                  Accepter invitation →
                </a>
              </p>
              <p style="color:#999;font-size:13px;margin:24px 0 0;">Linket udløber om 7 dage. Hvis du ikke forventede denne invitation, kan du ignorere denne email.</p>
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark</div>
        </div>
      `,
    });
    log(`Team invite email sent to ${toEmail} for team "${teamName}"`);
  } catch (err: any) {
    log(`Failed to send team invite email to ${toEmail}: ${err.message}`);
  }
}
