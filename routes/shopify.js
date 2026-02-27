const express = require('express');
const router = express.Router();
const SibApiV3Sdk = require('sib-api-v3-sdk');

// Brevo setup
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = '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';

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Send bekræftelsesmail
async function sendConfirmationEmail(email, packageName) {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.to = [{ email }];
  sendSmtpEmail.sender = { 
    name: 'Nordic Sketch', 
    email: 'kontakt@nordic-homebuilding.com' 
  };
  sendSmtpEmail.subject = 'Dit køb er bekræftet - Nordic Sketch';
  sendSmtpEmail.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Hej!</h2>

          <p>Tak for dit køb af <strong>${packageName}</strong>.</p>

          <p>Dine billeder er klar til brug med det samme:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://room-stylist.fredefussing.replit.app" 
               style="background: #1a1a1a; color: #fff; padding: 15px 30px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;">
              Gå til Nordic Sketch
            </a>
          </div>

          <p>Har du spørgsmål? Svar på denne mail.</p>

          <p>Med venlig hilsen,<br>/Nordic Sketch</p>
        </div>
      </body>
    </html>
  `;

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('Bekræftelsesmail sendt til:', email);
  } catch (error) {
    console.error('Fejl ved afsendelse af mail:', error);
  }
}

// Webhook fra Shopify
router.post('/webhook', express.json({type: 'application/json'}), async (req, res) => {
  try {
    const order = req.body;
    const email = order.email;
    const items = order.line_items;

    console.log('Shopify ordre modtaget:', order.name, 'fra:', email);

    for (const item of items) {
      let packageName = '';

      if (item.variant_id === 10220649021782) {
        packageName = '10 AI-billeder - Basic';
      } else if (item.variant_id === 10220626149718) {
        packageName = '25 AI-billeder - Pro';
      } else if (item.variant_id === 10220614877526) {
        packageName = '60 AI-billeder - Unlimited';
      }

      if (packageName) {
        // Send bekræftelsesmail
        await sendConfirmationEmail(email, packageName);

        // Gem i memory/database (tilføj din egen lagring her)
        console.log(`Køb registreret: ${packageName} til ${email}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook fejl:', error);
    res.status(500).send('Error');
  }
});

// Success side efter betaling
router.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="da">
    <head>
      <meta charset="UTF-8">
      <title>Betaling gennemført - Nordic Sketch</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          background: #f5f5f0; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          height: 100vh; 
          margin: 0; 
        }
        .success-box { 
          background: #fff; 
          padding: 3rem; 
          border-radius: 16px; 
          text-align: center; 
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .success-icon { 
          font-size: 4rem; 
          margin-bottom: 1rem; 
        }
        h1 { color: #27ae60; margin-bottom: 1rem; }
        p { color: #666; margin-bottom: 2rem; }
        .btn { 
          background: #1a1a1a; 
          color: #fff; 
          padding: 1rem 2rem; 
          text-decoration: none; 
          border-radius: 8px; 
          display: inline-block;
        }
      </style>
    </head>
    <body>
      <div class="success-box">
        <div class="success-icon">✅</div>
        <h1>Betaling gennemført!</h1>
        <p>Tak for dit køb. Du har nu adgang til flere billeder og alle stilarter.</p>
        <p>En bekræftelsesmail er sendt til dig.</p>
        <a href="/" class="btn">Gå til appen</a>
      </div>
    </body>
    </html>
  `);
});

module.exports = router;