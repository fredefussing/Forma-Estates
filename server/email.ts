import { log } from "./index";

const ADMIN_EMAIL = "fredefussing@gmail.com";
const FROM_EMAIL = "fredefussing@gmail.com";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendBrevoEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY1 || process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY not configured");
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Nordic Sketch", email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${errorText}`);
  }

  return response.json();
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
  try {
    await sendBrevoEmail(
      ADMIN_EMAIL,
      `Ny tilbudsforespørgsel #${data.designId}`,
      `
        <h2>Ny tilbudsforespørgsel</h2>
        <p><strong>Kunde email:</strong> ${data.customerEmail}</p>
        <p><strong>Rum:</strong> ${data.roomType}</p>
        <p><strong>Stil:</strong> ${data.style}</p>
        <p><strong>Budget:</strong> ${data.budget ? data.budget.toLocaleString('da-DK') + ' kr' : 'Ikke angivet'}</p>
        ${data.notes ? `<p><strong>Ønsker:</strong> "${data.notes}"</p>` : ''}
        <h3>AI genereret billede:</h3>
        <img src="${data.generatedImageUrl}" style="max-width: 600px; border-radius: 8px;" />
        <hr />
        <p><em>Find produkter, byg tilbud, send til kunde.</em></p>
      `
    );
    log(`Quote request email sent to ${ADMIN_EMAIL} for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send quote request email: ${err.message}`);
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
    await sendBrevoEmail(
      ADMIN_EMAIL,
      `Ny manuel forespørgsel #${data.designId}`,
      `
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
      `
    );
    log(`Special request email sent to ${ADMIN_EMAIL} for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send special request email: ${err.message}`);
  }
}
