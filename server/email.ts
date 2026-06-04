import { log } from "./index";
import { getStoreSearchUrl } from "./product_matcher";
import type { AnalysisResult, OpenAIProduct } from "./ai_analyzer";
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
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Velkommen til Forma Estates!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Hej!</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Tak for at du oprettede en konto. Du har nu <strong>2 gratis AI-billeder</strong> klar til brug!</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Med Forma Estates kan du:</p>
          <ul style="color: #666; font-size: 16px; line-height: 2;">
            <li>Transformere dit rum med AI</li>
            <li>Vælge mellem 8 forskellige stilarter</li>
            <li>Se dit hjem før du køber møbler</li>
          </ul>
          <p style="text-align: center; margin: 30px 0;">
            <a href="https://formaestates.com/find-stil"
               style="background: #1a1a1a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">
              Start dit første design →
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">Har du spørgsmål? Svar bare på denne mail.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Med venlig hilsen,<br><strong>Frederik fra Forma Estates</strong></p>
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
      subject: `Ny brugeroprettelse - ${email}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 24px;">Ny bruger oprettet</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; width: 160px;">Brugerens email:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Tidspunkt:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${timestamp}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Tilmelding via:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${sourceLabel}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Forma Estates — Admin notifikation</p>
        </div>
      `,
    });
    log(`Admin signup notification sent for ${email}`);
  } catch (err: any) {
    log(`Failed to send admin signup notification for ${email}: ${err.message}`);
  }
}

export async function sendQuoteRequestEmail(data: {
  customerEmail: string;
  notes?: string | null;
  roomType: string;
  style: string;
  budget?: number | null;
  generatedImageUrl: string;
  designId: number;
}) {
  const now = new Date();
  const timestamp = now.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });

  const roomLabels: Record<string, string> = {
    "living room": "Stue", "bedroom": "Soveværelse", "kitchen": "Køkken",
    "bathroom": "Badeværelse", "dining room": "Spisestue", "home office": "Hjemmekontor",
    "kids room": "Børneværelse", "studio": "Studio", "game room": "Spillerum",
    "home gym": "Træningsrum", "laundry room": "Vaskerum", "conference room": "Mødelokale",
    "spa room": "Spa", "outdoor": "Udendørs", "open living and dining room": "Åben stue/spisestue",
  };

  const styleLabels: Record<string, string> = {
    scandinavian: "Skandinavisk", modern: "Moderne", luxury: "Luksus",
    industrial: "Industriel", coastal: "Kyst", transitional: "Overgangs",
    farmhouse: "Landlig", midcentury: "Midcentury",
  };

  const roomLabel = roomLabels[data.roomType] || data.roomType;
  const styleLabel = styleLabels[data.style] || data.style;
  const budgetLabel = data.budget ? data.budget.toLocaleString("da-DK") + " kr" : "Ikke angivet";

  try {
    await sendBrevoEmail({
      to: data.customerEmail,
      subject: "Vi har modtaget din tilbudsforespørgsel",
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Tak for din henvendelse!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Vi har modtaget din tilbudsforespørgsel og arbejder på at sammensætte et personligt tilbud til dig.</p>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="color: #666; font-size: 14px; margin: 0 0 8px;"><strong>Dit design:</strong> ${roomLabel} i ${styleLabel} stil</p>
            <p style="color: #666; font-size: 14px; margin: 0;"><strong>Budget:</strong> ${budgetLabel}</p>
          </div>
          <p style="color: #666; font-size: 16px; line-height: 1.6;"><strong>Hvad sker der nu?</strong></p>
          <ul style="color: #666; font-size: 15px; line-height: 2;">
            <li>Vi gennemgår dit design og finder de bedste produkter</li>
            <li>Du modtager et personligt tilbud indenfor 24 timer</li>
            <li>Tilbuddet er uforpligtende og gratis</li>
          </ul>
          <p style="color: #666; font-size: 14px;">Har du spørgsmål i mellemtiden? Svar bare på denne mail.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Med venlig hilsen,<br><strong>Frederik fra Forma Estates</strong></p>
        </div>
      `,
    });
    log(`Quote confirmation email sent to ${data.customerEmail} for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send quote confirmation email to ${data.customerEmail}: ${err.message}`);
  }

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `Ny tilbudsforespørgsel — ${data.customerEmail}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: data.customerEmail,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Tilbudsforespørgsel</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">Ny tilbudsforespørgsel</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;width:160px;border-bottom:1px solid #F0EBE1;">Email</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;"><a href="mailto:${data.customerEmail}" style="color:#0F1923;">${data.customerEmail}</a></td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Rum-type</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;">${roomLabel}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Stil</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;">${styleLabel}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Budget</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:600;border-bottom:1px solid #F0EBE1;">${budgetLabel}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Tidspunkt</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;border-bottom:1px solid #F0EBE1;">${timestamp}</td></tr>
              ${data.notes ? `<tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;vertical-align:top;">Bemærkninger</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;border-bottom:1px solid #F0EBE1;">${data.notes}</td></tr>` : ""}
            </table>
            <div style="padding:20px 28px;">
              <div style="color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">AI-genereret design</div>
              <img src="${data.generatedImageUrl}" alt="AI design" style="width:100%;border-radius:8px;display:block;" />
            </div>
            <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">
              Svar direkte på denne e-mail — den går til ${data.customerEmail}.
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Admin notifikation</div>
        </div>
      `,
    });
    log(`Admin quote notification sent for design #${data.designId} (${data.customerEmail})`);
  } catch (err: any) {
    log(`Failed to send admin quote notification: ${err.message}`);
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
  const now = new Date();
  const timestamp = now.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });

  const productLabel = `Få ${data.imageCount} AI-genererede billeder (${data.price} kr)`;

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

export async function sendSpecialRequestEmail(data: {
  customerEmail?: string | null;
  request: string;
  originalImageUrl: string;
  designId: number;
  price: number;
}) {
  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `Manuel forespørgsel #${data.designId}${data.customerEmail ? " — " + data.customerEmail : ""}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: data.customerEmail || KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Manuel tilpasning</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">Ny forespørgsel #${data.designId}</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${data.customerEmail ? `<tr><td style="padding:10px 14px;color:#777;font-size:13px;width:160px;border-bottom:1px solid #F0EBE1;">Kunde email</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;"><a href="mailto:${data.customerEmail}" style="color:#0F1923;">${data.customerEmail}</a></td></tr>` : ""}
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Pris</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:700;border-bottom:1px solid #F0EBE1;">${data.price} kr</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;vertical-align:top;">Ønske</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;line-height:1.55;">${data.request.replace(/</g, "&lt;")}</td></tr>
            </table>
            <div style="padding:20px 28px;border-top:1px solid #F0EBE1;">
              <div style="color:#777;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Originalt billede</div>
              <img src="${data.originalImageUrl}" alt="Originalt billede" style="width:100%;border-radius:8px;display:block;" />
            </div>
            <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">
              ${data.customerEmail ? `Svar direkte på denne e-mail — den går til ${data.customerEmail}.` : "Ingen kunde-email angivet."}
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Admin notifikation</div>
        </div>
      `,
    });
    log(`Special request email sent to ${KONTAKT_EMAIL} for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send special request email: ${err.message}`);
  }
}

function renderProductRow(p: OpenAIProduct): string {
  const store1 = p.recommendedStores?.[0] ?? null;
  const store2 = p.recommendedStores?.[1] ?? null;

  const store1Html = store1
    ? `<a href="${getStoreSearchUrl(store1, p.searchTerms)}" style="display:inline-block; margin-right:4px; margin-top:4px; padding:4px 12px; background:#1a1a1a; color:#fff; border-radius:16px; font-size:12px; text-decoration:none; font-weight:500;">${store1} →</a>`
    : "";
  const store2Html = store2
    ? `<a href="${getStoreSearchUrl(store2, p.searchTerms)}" style="display:inline-block; margin-top:4px; padding:4px 12px; background:#555; color:#fff; border-radius:16px; font-size:12px; text-decoration:none; font-weight:500;">${store2} →</a>`
    : "";

  return `<tr>
    <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top;">
      <strong style="font-size:14px;">${p.name}</strong>
    </td>
    <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top; white-space:nowrap; font-weight:700; font-size:14px; color:#1a1a1a;">
      ${p.exactBudget.toLocaleString("da-DK")} kr
    </td>
    <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top;">
      <code style="font-family:monospace; font-size:13px; background:#f4f4f4; padding:5px 10px; border-radius:6px; display:inline-block; color:#1a1a1a; font-weight:600; letter-spacing:0.2px;">${p.searchTerms}</code>
    </td>
    <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top; font-size:13px; color:#666; line-height:1.5;">
      ${p.visualDescription}
    </td>
    <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top;">
      ${store1Html}${store2Html}
    </td>
  </tr>`;
}

export async function sendAIAnalysisEmail(data: {
  customerEmail: string;
  designId: number;
  roomType: string;
  style: string;
  budget: number;
  resultImageUrl: string;
  originalImageUrl: string;
  analysis: AnalysisResult;
}) {
  const roomLabels: Record<string, string> = {
    "living room": "Stue", bedroom: "Soveværelse", kitchen: "Køkken",
    bathroom: "Badeværelse", "dining room": "Spisestue", "home office": "Hjemmekontor",
    "kids room": "Børneværelse", studio: "Studio", "game room": "Spillerum",
    "home gym": "Træningsrum", "laundry room": "Vaskerum", "conference room": "Mødelokale",
    "spa room": "Spa", outdoor: "Udendørs", "open living and dining room": "Åben stue/spisestue",
  };
  const styleLabels: Record<string, string> = {
    scandinavian: "Skandinavisk", modern: "Moderne", luxury: "Luksus",
    industrial: "Industriel", coastal: "Kyst", transitional: "Overgangs",
    farmhouse: "Landlig", midcentury: "Midcentury",
  };

  const roomLabel = roomLabels[data.roomType] || data.roomType;
  const styleLabel = styleLabels[data.style] || data.style;
  const now = new Date().toLocaleDateString("da-DK", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });

  const productRows = data.analysis.products.map(renderProductRow).join("");

  const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; max-width:700px; margin:0 auto; color:#222; background:#fff;">

      <!-- HEADER -->
      <div style="background:#1a1a1a; padding:24px 28px; border-radius:12px 12px 0 0;">
        <h1 style="color:#fff; margin:0; font-size:20px; font-weight:600;">🛋️ Ny tilbudsforespørgsel — AI Analyse</h1>
        <p style="color:#aaa; margin:6px 0 0; font-size:13px;">${now}</p>
      </div>

      <div style="padding:28px; border:1px solid #eee; border-top:none; border-radius:0 0 12px 12px;">

        <!-- KUNDE + DESIGN INFO -->
        <div style="background:#f8f8f8; border-radius:10px; padding:16px 20px; margin-bottom:24px;">
          <h3 style="margin:0 0 12px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#999;">Kundeinfo</h3>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:4px 0; color:#666; width:80px;">Email:</td><td style="font-weight:600;"><a href="mailto:${data.customerEmail}" style="color:#1a1a1a;">${data.customerEmail}</a></td></tr>
            <tr><td style="padding:4px 0; color:#666;">Design:</td><td style="font-weight:600;">#${data.designId}</td></tr>
            <tr><td style="padding:4px 0; color:#666;">Rum:</td><td style="font-weight:600;">${roomLabel}</td></tr>
            <tr><td style="padding:4px 0; color:#666;">Stil:</td><td style="font-weight:600;">${styleLabel}</td></tr>
            <tr><td style="padding:4px 0; color:#666;">Budget:</td><td style="font-weight:700; font-size:15px; color:#1a1a1a;">${data.budget.toLocaleString("da-DK")} kr</td></tr>
          </table>
        </div>

        <!-- BILLEDER -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
          <tr>
            <td style="width:50%; padding-right:8px; vertical-align:top;">
              <p style="margin:0 0 6px; font-size:11px; color:#888; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Originalt billede</p>
              <img src="${data.originalImageUrl}" alt="Originalt rum" style="width:100%; border-radius:8px; display:block;" />
            </td>
            <td style="width:50%; padding-left:8px; vertical-align:top;">
              <p style="margin:0 0 6px; font-size:11px; color:#888; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">AI-genereret design</p>
              <img src="${data.resultImageUrl}" alt="AI redesign" style="width:100%; border-radius:8px; display:block;" />
            </td>
          </tr>
        </table>

        <!-- PRODUKTTABEL -->
        <h3 style="margin:0 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#999;">AI Analyse — Identificerede produkter</h3>
        <p style="margin:0 0 14px; font-size:13px; color:#666; font-style:italic;">Kopier søgeordet → indsæt i butikkens søgefelt → find produkt.</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px; border:1px solid #eee; border-radius:10px; overflow:hidden;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666;">Produkt</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666; white-space:nowrap;">Budget</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666;">Søgeord (kopier)</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666;">AI ser dette</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666;">Anbefaling</th>
            </tr>
          </thead>
          <tbody>${productRows}</tbody>
        </table>

        <!-- ØKONOMI -->
        <div style="background:#1a1a1a; border-radius:10px; padding:20px 24px; margin-top:24px; color:#fff;">
          <h3 style="margin:0 0 14px; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:#aaa;">Økonomi</h3>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr>
              <td style="padding:5px 0; color:#ccc;">Kundens budget:</td>
              <td style="padding:5px 0; text-align:right; font-weight:600;">${data.budget.toLocaleString("da-DK")} kr</td>
            </tr>
            <tr>
              <td style="padding:5px 0; color:#ccc;">Produkter (85%):</td>
              <td style="padding:5px 0; text-align:right; font-weight:600;">${data.analysis.totalProductBudget.toLocaleString("da-DK")} kr</td>
            </tr>
            <tr style="border-top:1px solid #333;">
              <td style="padding:10px 0 0; color:#4ade80; font-weight:700; font-size:16px;">Din profit (15%):</td>
              <td style="padding:10px 0 0; text-align:right; font-weight:700; font-size:16px; color:#4ade80;">${data.analysis.profit.toLocaleString("da-DK")} kr</td>
            </tr>
          </table>
          <div style="margin-top:16px; padding-top:16px; border-top:1px solid #333;">
            <a href="https://formaestates.com/admin/quotes" style="display:inline-block; background:#fff; color:#1a1a1a; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600; font-size:13px;">Byg tilbud i admin →</a>
          </div>
        </div>

      </div>

      <p style="color:#ccc; font-size:11px; text-align:center; margin-top:16px;">Forma Estates — AI Analyse System · Design #${data.designId}</p>
    </div>
  `;

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `📦 Ny tilbudsforespørgsel: ${roomLabel}, ${data.budget.toLocaleString("da-DK")} kr — ${data.customerEmail}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: data.customerEmail,
      html,
    });
    log(`AI analysis admin email sent for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send AI analysis admin email: ${err.message}`);
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
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F5F3EF; padding: 32px;">
          <div style="background: #0F1D2F; padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #C8956C; font-size: 22px; margin: 0;">Forma Estates</h1>
            <p style="color: rgba(245,243,239,0.6); font-size: 13px; margin: 4px 0 0;">Forma Estates</p>
          </div>
          <div style="background: #fff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #E8E4DE;">
            <h2 style="color: #0F1D2F; font-size: 20px; margin: 0 0 16px;">Du er inviteret!</h2>
            <p style="color: #6B6B6B; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
              Du er blevet inviteret til at blive medlem af teamet <strong style="color: #1A1A1A;">"${teamName}"</strong> på Forma Estates.
            </p>
            <a href="${inviteLink}" style="display: inline-block; background: #C8956C; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
              Accepter invitation
            </a>
            <p style="color: #9B9690; font-size: 13px; margin: 24px 0 0;">Linket udløber om 7 dage. Hvis du ikke forventede denne invitation, kan du ignorere denne email.</p>
          </div>
        </div>
      `,
    });
    log(`Team invite email sent to ${toEmail} for team "${teamName}"`);
  } catch (err: any) {
    log(`Failed to send team invite email to ${toEmail}: ${err.message}`);
  }
}
