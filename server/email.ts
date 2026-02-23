// SendGrid integration for email notifications
import sgMail from '@sendgrid/mail';
import { log } from "./index";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
}

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return { client: sgMail, fromEmail: email };
}

const ADMIN_EMAIL = "fredefussing@gmail.com";

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
    const { client, fromEmail } = await getUncachableSendGridClient();

    await client.send({
      to: ADMIN_EMAIL,
      from: fromEmail,
      subject: `Ny tilbudsforespørgsel #${data.designId}`,
      html: `
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
      `,
    });

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
    const { client, fromEmail } = await getUncachableSendGridClient();

    await client.send({
      to: ADMIN_EMAIL,
      from: fromEmail,
      subject: `Ny manuel forespørgsel #${data.designId}`,
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

    log(`Special request email sent to ${ADMIN_EMAIL} for design #${data.designId}`);
  } catch (err: any) {
    log(`Failed to send special request email: ${err.message}`);
  }
}
