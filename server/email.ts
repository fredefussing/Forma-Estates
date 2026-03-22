import { log } from "./index";
import { getBackupLinks } from "./product_matcher";
import type { AnalysisResult } from "./ai_analyzer";

const KONTAKT_EMAIL = "kontakt@nordic-homebuild.com";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

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
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY not configured");
  }

  const payload: Record<string, unknown> = {
    sender: { name: options.senderName || "Nordic Homebuild", email: options.senderEmail },
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
  };

  if (options.replyTo) {
    payload.replyTo = { email: options.replyTo };
  }

  if (options.bcc) {
    payload.bcc = [{ email: options.bcc }];
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${errorText}`);
  }

  return response.json();
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
      subject: "Velkommen til Nordic Homebuild!",
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Velkommen til Nordic Homebuild!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Hej!</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Tak for at du oprettede en konto. Du har nu <strong>2 gratis AI-billeder</strong> klar til brug!</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Med Nordic Homebuild kan du:</p>
          <ul style="color: #666; font-size: 16px; line-height: 2;">
            <li>Transformere dit rum med AI</li>
            <li>Vælge mellem 8 forskellige stilarter</li>
            <li>Se dit hjem før du køber møbler</li>
          </ul>
          <p style="text-align: center; margin: 30px 0;">
            <a href="https://nordic-homebuild.com/find-stil"
               style="background: #1a1a1a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">
              Start dit første design →
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">Har du spørgsmål? Svar bare på denne mail.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Med venlig hilsen,<br><strong>Frederik fra Nordic Homebuild</strong></p>
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
          <p style="color: #999; font-size: 12px;">Nordic Homebuild — Admin notifikation</p>
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
          <p style="color: #999; font-size: 12px;">Med venlig hilsen,<br><strong>Frederik fra Nordic Homebuild</strong></p>
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
      subject: `Ny tilbudsforespørgsel - ${data.customerEmail}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 24px;">Ny tilbudsforespørgsel</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; width: 160px;">Kundens email:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${data.customerEmail}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Rum-type:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${roomLabel}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Valgt stil:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${styleLabel}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Budget:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${budgetLabel}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Tidspunkt:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${timestamp}</td>
            </tr>
            ${data.notes ? `<tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Bemærkninger:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${data.notes}</td>
            </tr>` : ""}
          </table>
          <h3 style="color: #1a1a1a; font-size: 16px; margin-top: 24px;">AI genereret design:</h3>
          <img src="${data.generatedImageUrl}" alt="Genereret design" style="max-width: 100%; border-radius: 8px; margin-top: 8px;" />
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Nordic Homebuild — Admin notifikation</p>
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
      subject: `Nyt salg - ${data.packageName} pakke - ${data.customerEmail}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 24px;">Nyt salg!</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; width: 160px;">Kundens email:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${data.customerEmail}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Produkt:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${productLabel}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Pris:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${data.price} kr</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Tidspunkt:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600;">${timestamp}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Nordic Homebuild — Admin notifikation</p>
        </div>
      `,
    });
    log(`Admin sale notification sent for order #${data.orderId} (${data.customerEmail})`);
  } catch (err: any) {
    log(`Failed to send admin sale notification: ${err.message}`);
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
      subject: `Ny manuel forespørgsel #${data.designId}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <h2>Ny kunde vil have manuel tilpasning</h2>
        <p><strong>Ønske:</strong> ${data.request}</p>
        <p><strong>Pris:</strong> ${data.price} kr</p>
        ${data.customerEmail ? `<p><strong>Kunde email:</strong> ${data.customerEmail}</p>` : '<p><em>Ingen email angivet</em></p>'}
        <h3>Originalt billede:</h3>
        <img src="${data.originalImageUrl}" style="max-width: 600px; border-radius: 8px;" />
        <hr />
        <h3>Din opgave:</h3>
        <ol>
          <li>Åbn billedet i Photoshop/Canva</li>
          <li>Ret: ${data.request}</li>
          <li>Upload rettet version til admin</li>
          <li>Send til kunde</li>
        </ol>
      `,
    });
    log(`Special request email sent to ${KONTAKT_EMAIL} for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send special request email: ${err.message}`);
  }
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

  const productRows = data.analysis.products
    .map((p) => {
      const backups = getBackupLinks(p.name, p.searchTerms);
      const backupLinks = backups
        .map((s) => `<a href="${s.searchUrl}" style="display:inline-block; margin:2px 4px 2px 0; padding:4px 12px; background:#1a1a1a; color:#fff; border-radius:20px; font-size:12px; text-decoration:none; font-weight:500;">${s.name}</a>`)
        .join("");
      return `<tr>
        <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top;">
          <strong style="font-size:14px;">${p.name}</strong>
        </td>
        <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top; white-space:nowrap; font-weight:700; font-size:14px; color:#1a1a1a;">
          ${p.estimatedPrice.toLocaleString("da-DK")} kr
        </td>
        <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top;">
          <span style="font-family:monospace; font-size:13px; background:#f4f4f4; padding:4px 8px; border-radius:6px; display:inline-block; user-select:all; color:#333;">${p.searchTerms}</span>
        </td>
        <td style="padding:14px 12px; border-bottom:1px solid #eee; vertical-align:top;">
          ${backupLinks}
        </td>
      </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; max-width:700px; margin:0 auto; color:#222; background:#fff;">

      <!-- HEADER -->
      <div style="background:#1a1a1a; padding:24px 28px; border-radius:12px 12px 0 0;">
        <h1 style="color:#fff; margin:0; font-size:20px; font-weight:600;">🛋️ Ny tilbudsforespørgsel — AI Analyse</h1>
        <p style="color:#aaa; margin:6px 0 0; font-size:13px;">${now}</p>
      </div>

      <div style="padding:28px; border:1px solid #eee; border-top:none; border-radius:0 0 12px 12px;">

        <!-- 1. KUNDE INFO -->
        <div style="background:#f8f8f8; border-radius:10px; padding:16px 20px; margin-bottom:24px;">
          <h3 style="margin:0 0 12px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#999;">1. Kundeinfo</h3>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr>
              <td style="padding:4px 0; color:#666; width:100px;">Email:</td>
              <td style="padding:4px 0; font-weight:600;"><a href="mailto:${data.customerEmail}" style="color:#1a1a1a;">${data.customerEmail}</a></td>
            </tr>
            <tr>
              <td style="padding:4px 0; color:#666;">Design ID:</td>
              <td style="padding:4px 0; font-weight:600;">#${data.designId}</td>
            </tr>
          </table>
        </div>

        <!-- 2. DESIGN INFO -->
        <div style="background:#f8f8f8; border-radius:10px; padding:16px 20px; margin-bottom:24px;">
          <h3 style="margin:0 0 12px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#999;">2. Designinfo</h3>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr>
              <td style="padding:4px 0; color:#666; width:100px;">Rum:</td>
              <td style="padding:4px 0; font-weight:600;">${roomLabel}</td>
            </tr>
            <tr>
              <td style="padding:4px 0; color:#666;">Stil:</td>
              <td style="padding:4px 0; font-weight:600;">${styleLabel}</td>
            </tr>
            <tr>
              <td style="padding:4px 0; color:#666;">Budget:</td>
              <td style="padding:4px 0; font-weight:700; font-size:15px; color:#1a1a1a;">${data.budget.toLocaleString("da-DK")} kr</td>
            </tr>
          </table>
        </div>

        <!-- 3. BILLEDER -->
        <h3 style="margin:0 0 12px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#999;">3. Billeder</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
          <tr>
            <td style="width:50%; padding-right:8px; vertical-align:top;">
              <p style="margin:0 0 6px; font-size:12px; color:#888; font-weight:600;">ORIGINALT BILLEDE</p>
              <img src="${data.originalImageUrl}" alt="Originalt rum" style="width:100%; border-radius:8px; display:block;" />
            </td>
            <td style="width:50%; padding-left:8px; vertical-align:top;">
              <p style="margin:0 0 6px; font-size:12px; color:#888; font-weight:600;">AI-GENERERET DESIGN</p>
              <img src="${data.resultImageUrl}" alt="AI redesign" style="width:100%; border-radius:8px; display:block;" />
            </td>
          </tr>
        </table>

        <!-- 4. AI ANALYSE -->
        <h3 style="margin:0 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#999;">4. AI Analyse — Identificerede møbler</h3>
        <p style="margin:0 0 12px; font-size:13px; color:#666; font-style:italic;">Kopier søgeord → indsæt direkte i butikkens søgefelt. Ingen match? Brug backup-links.</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px; border:1px solid #eee; border-radius:10px; overflow:hidden;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666; white-space:nowrap;">Produkt</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666; white-space:nowrap;">Budget</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666;">Søgeord (kopier)</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #ddd; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#666; white-space:nowrap;">Backup</th>
            </tr>
          </thead>
          <tbody>${productRows}</tbody>
        </table>

        <!-- 5. SAMMENFATNING -->
        <div style="background:#1a1a1a; border-radius:10px; padding:20px 24px; margin-top:24px; color:#fff;">
          <h3 style="margin:0 0 14px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#aaa;">5. Sammenfatning</h3>
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
            <a href="https://nordic-homebuild.com/admin/quotes" style="display:inline-block; background:#fff; color:#1a1a1a; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600; font-size:13px;">Byg tilbud i admin →</a>
          </div>
        </div>

      </div>

      <p style="color:#ccc; font-size:11px; text-align:center; margin-top:16px;">Nordic Homebuild — AI Analyse System · Design #${data.designId}</p>
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
