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
      sender: { name: "Nordic Homebuilding", email: FROM_EMAIL },
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

export async function sendWelcomeEmail(email: string) {
  try {
    await sendBrevoEmail(
      email,
      "Velkommen til Nordic Homebuilding!",
      `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Velkommen til Nordic Homebuilding!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Hej!</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Tak for at du oprettede en konto. Du har nu <strong>2 gratis AI-billeder</strong> klar til brug!</p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Med Nordic Homebuilding kan du:</p>
          <ul style="color: #666; font-size: 16px; line-height: 2;">
            <li>Transformere dit rum med AI</li>
            <li>Vælge mellem 8 forskellige stilarter</li>
            <li>Se dit hjem før du køber møbler</li>
          </ul>
          <p style="text-align: center; margin: 30px 0;">
            <a href="https://nordic-homebuilding.replit.app/find-stil"
               style="background: #1a1a1a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">
              Start dit første design →
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">Har du spørgsmål? Svar bare på denne mail.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Med venlig hilsen,<br><strong>Frederik fra Nordic Homebuilding</strong></p>
        </div>
      `
    );

    await sendBrevoEmail(
      ADMIN_EMAIL,
      `Ny bruger oprettet: ${email}`,
      `<h2>Ny bruger!</h2><p><strong>Email:</strong> ${email}</p><p>Velkomstmail sendt automatisk.</p>`
    );

    log(`Welcome email sent to ${email}`);
  } catch (err: any) {
    log(`Failed to send welcome email to ${email}: ${err.message}`);
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

export async function sendOrderConfirmationEmail(data: {
  customerEmail: string;
  customerName: string;
  packageName: string;
  imageCount: number;
  price: number;
  orderId: string;
}) {
  try {
    await sendBrevoEmail(
      data.customerEmail,
      `Tak for dit køb — ${data.packageName} pakke | Nordic Homebuilding`,
      `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Tak for dit køb, ${data.customerName}!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">Din ${data.packageName} pakke er nu aktiv.</p>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="margin: 0 0 16px; color: #1a1a1a;">Din pakke:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">Pakke:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${data.packageName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">AI-billeder:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${data.imageCount} stk</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Pris:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${data.price} kr</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Ordre #:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${data.orderId}</td>
              </tr>
            </table>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 1.6;">Du har nu adgang til alle 8 stilarter, alle 15 rum og alle 3 budget-niveauer.</p>
          <a href="https://nordic-homebuilding.replit.app/design" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">Start dit design →</a>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">Nordic Homebuilding — AI-drevet interiørdesign</p>
        </div>
      `
    );

    await sendBrevoEmail(
      ADMIN_EMAIL,
      `Nyt salg: ${data.packageName} pakke — ${data.price} kr`,
      `
        <h2>Nyt salg!</h2>
        <p><strong>Kunde:</strong> ${data.customerName} (${data.customerEmail})</p>
        <p><strong>Pakke:</strong> ${data.packageName}</p>
        <p><strong>Pris:</strong> ${data.price} kr</p>
        <p><strong>Billeder:</strong> ${data.imageCount} stk</p>
        <p><strong>Ordre #:</strong> ${data.orderId}</p>
      `
    );

    log(`Order confirmation emails sent for order #${data.orderId} to ${data.customerEmail}`);
  } catch (err: any) {
    log(`Failed to send order confirmation email: ${err.message}`);
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
