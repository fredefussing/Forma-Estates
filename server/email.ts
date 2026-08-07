import nodemailer from "nodemailer";

// Local logger — deliberately NOT imported from ./index so this module can be
// loaded standalone (tests, scripts) without booting the whole server.
function log(message: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [express] ${message}`);
}

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
    // Fail fast when the host blocks outbound SMTP (e.g. Render) instead of
    // hanging for nodemailer's 2-minute default and stalling API requests.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

const transporter = createTransporter();

// Tests SMTP connectivity + login without sending a mail (used by live diagnostics).
export async function verifySmtpConnection(): Promise<void> {
  if (!process.env.SMTP_PASSWORD) {
    throw new Error("SMTP_PASSWORD not configured");
  }
  await transporter.verify();
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  senderEmail: string;
  senderName?: string;
  replyTo?: string;
  bcc?: string;
}

// HTTPS-based sending via Brevo's API (port 443 — works on hosts that block
// outbound SMTP, e.g. Render). Used automatically when BREVO_API_KEY is set.
async function sendViaBrevoApi(options: EmailOptions) {
  const payload: Record<string, unknown> = {
    sender: { name: options.senderName || SENDER_NAME, email: KONTAKT_EMAIL },
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
    replyTo: { email: options.replyTo || KONTAKT_EMAIL },
  };
  if (options.bcc) payload.bcc = [{ email: options.bcc }];

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function sendBrevoEmail(options: EmailOptions) {
  if (process.env.BREVO_API_KEY) {
    await sendViaBrevoApi(options);
    return;
  }

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

// Bruges KUN af live-diagnostikken til at afsløre den præcise afsendelsesfejl
// (Brevo API-status + fejltekst) i produktion.
export async function sendTestEmail(to: string) {
  await sendBrevoEmail({
    to,
    subject: "Testmail — Forma Estates diagnostik",
    senderEmail: KONTAKT_EMAIL,
    html: `<p>Dette er en testmail fra Forma Estates' diagnostikværktøj. Hvis du kan læse denne, virker mailafsendelsen.</p>`,
  });
}

// ─── Multilingual email helpers ─────────────────────────────────────────────
type Lang = "da" | "sv" | "de" | "nb" | "en" | "es" | "fr";
function normalizeLang(lang?: string): Lang {
  const l = (lang || "da").toLowerCase().split("-")[0];
  if (l === "no" || l === "nn") return "nb";
  const supported: Lang[] = ["da", "sv", "de", "nb", "en", "es", "fr"];
  return supported.includes(l as Lang) ? (l as Lang) : "en";
}
const FOOTER: Record<Lang, string> = {
  da: "© Forma Estates · Danskudviklet i Danmark",
  en: "© Forma Estates · Built in Denmark",
  sv: "© Forma Estates · Byggt i Danmark",
  de: "© Forma Estates · Entwickelt in Dänemark",
  nb: "© Forma Estates · Bygget i Danmark",
  es: "© Forma Estates · Fabricado en Dinamarca",
  fr: "© Forma Estates · Fabriqué au Danemark",
};
const VERIFY_STRINGS: Record<Lang, { subject: (c: string) => string; intro: string; validity: string }> = {
  da: { subject: c => `${c} er din aktiveringskode — Forma Estates`, intro: "Indtast denne kode for at aktivere din konto:", validity: "Koden er gyldig i 15 minutter. Har du ikke oprettet en konto hos Forma Estates, kan du ignorere denne mail." },
  en: { subject: c => `${c} is your activation code — Forma Estates`, intro: "Enter this code to activate your account:", validity: "The code is valid for 15 minutes. If you didn't create a Forma Estates account, you can ignore this email." },
  sv: { subject: c => `${c} är din aktiveringskod — Forma Estates`, intro: "Ange den här koden för att aktivera ditt konto:", validity: "Koden är giltig i 15 minuter. Har du inte skapat ett Forma Estates-konto kan du ignorera det här mejlet." },
  de: { subject: c => `${c} ist dein Aktivierungscode — Forma Estates`, intro: "Gib diesen Code ein, um dein Konto zu aktivieren:", validity: "Der Code ist 15 Minuten gültig. Falls du kein Forma Estates-Konto erstellt hast, kannst du diese E-Mail ignorieren." },
  nb: { subject: c => `${c} er din aktiveringskode — Forma Estates`, intro: "Skriv inn denne koden for å aktivere kontoen din:", validity: "Koden er gyldig i 15 minutter. Har du ikke opprettet en Forma Estates-konto, kan du ignorere denne e-posten." },
  es: { subject: c => `${c} es tu código de activación — Forma Estates`, intro: "Introduce este código para activar tu cuenta:", validity: "El código es válido durante 15 minutos. Si no has creado una cuenta en Forma Estates, puedes ignorar este correo." },
  fr: { subject: c => `${c} est votre code d'activation — Forma Estates`, intro: "Entrez ce code pour activer votre compte :", validity: "Le code est valable 15 minutes. Si vous n'avez pas créé de compte Forma Estates, vous pouvez ignorer cet e-mail." },
};
const RESET_STRINGS: Record<Lang, { subject: string; intro: string; button: string; altLink: string; validity: string }> = {
  da: { subject: "Nulstil dit password — Forma Estates", intro: "Vi har modtaget en anmodning om at nulstille passwordet til din Forma Estates-konto. Klik på knappen nedenfor for at vælge et nyt password:", button: "Nulstil password", altLink: "Kan du ikke klikke på knappen? Kopiér dette link ind i din browser:", validity: "Linket er gyldigt i 15 minutter." },
  en: { subject: "Reset your password — Forma Estates", intro: "We received a request to reset the password for your Forma Estates account. Click the button below to choose a new password:", button: "Reset password", altLink: "Can't click the button? Copy this link into your browser:", validity: "The link is valid for 15 minutes." },
  sv: { subject: "Återställ ditt lösenord — Forma Estates", intro: "Vi fick en begäran om att återställa lösenordet till ditt Forma Estates-konto. Klicka på knappen nedan för att välja ett nytt lösenord:", button: "Återställ lösenord", altLink: "Kan du inte klicka på knappen? Kopiera den här länken till din webbläsare:", validity: "Länken är giltig i 15 minuter." },
  de: { subject: "Passwort zurücksetzen — Forma Estates", intro: "Wir haben eine Anfrage zum Zurücksetzen des Passworts für dein Forma Estates-Konto erhalten. Klicke auf die Schaltfläche unten, um ein neues Passwort zu wählen:", button: "Passwort zurücksetzen", altLink: "Kannst du nicht auf die Schaltfläche klicken? Kopiere diesen Link in deinen Browser:", validity: "Der Link ist 15 Minuten gültig." },
  nb: { subject: "Tilbakestill passordet ditt — Forma Estates", intro: "Vi mottok en forespørsel om å tilbakestille passordet til Forma Estates-kontoen din. Klikk på knappen nedenfor for å velge et nytt passord:", button: "Tilbakestill passord", altLink: "Kan du ikke klikke på knappen? Kopier denne lenken til nettleseren din:", validity: "Lenken er gyldig i 15 minutter." },
  es: { subject: "Restablece tu contraseña — Forma Estates", intro: "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Forma Estates. Haz clic en el botón de abajo para elegir una nueva contraseña:", button: "Restablecer contraseña", altLink: "¿No puedes hacer clic en el botón? Copia este enlace en tu navegador:", validity: "El enlace es válido durante 15 minutos." },
  fr: { subject: "Réinitialisez votre mot de passe — Forma Estates", intro: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Forma Estates. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :", button: "Réinitialiser le mot de passe", altLink: "Vous ne pouvez pas cliquer sur le bouton ? Copiez ce lien dans votre navigateur :", validity: "Le lien est valable 15 minutes." },
};
const WELCOME_STRINGS: Record<Lang, { subject: string; headline: string; body1: string; featTitle: string; feats: [string, string][]; upgradeText: string; dashCta: string; priceCta: string; closing: string }> = {
  da: { subject: "Velkommen til Forma Estates!", headline: "Velkommen til Forma Estates!", body1: "Tak fordi du oprettede en konto. Forma Estates hjælper professionelle i hele ejendomsbranchen med at præsentere ejendomme på deres allerbedste med fotorealistiske AI-visualiseringer.", featTitle: "Det kan du med Forma Estates", feats: [["AI-indretningsdesign", "Foto af et rum → fotorealistisk redesign på sekunder"], ["3D-plantegninger", "2D-plantegning → flot 3D-version"], ["Videoer & showcases", "Før/efter-videoer og præsentationsvideoer til annoncer og SoMe"], ["AI Design Agent", "Beskriv frit hvad du ønsker — fuld kreativ frihed"]], upgradeText: "Vil du have fuld adgang til 3D-plantegninger, videoer, showcases og flere månedlige visualiseringer? <strong style=\"color:#0F1923;\">Opgradér til et abonnement</strong> — fra 2.999 kr/md.", dashCta: "Start dit første design →", priceCta: "Se abonnementer & opgradér nu", closing: "Spørgsmål? Svar blot på denne mail — vi sidder klar." },
  en: { subject: "Welcome to Forma Estates!", headline: "Welcome to Forma Estates!", body1: "Thank you for creating an account. Forma Estates helps property professionals present their listings at their very best with photorealistic AI visualizations.", featTitle: "What you can do with Forma Estates", feats: [["AI Interior Design", "Room photo → photorealistic redesign in seconds"], ["3D Floor Plans", "2D plan → stunning 3D version"], ["Videos & Showcases", "Before/after videos and presentation videos for listings and social media"], ["AI Design Agent", "Describe freely what you want — full creative freedom"]], upgradeText: "Want full access to 3D floor plans, videos, showcases and more monthly visualizations? <strong style=\"color:#0F1923;\">Upgrade to a subscription</strong> — from 2,999 DKK/mo.", dashCta: "Start your first design →", priceCta: "View subscriptions & upgrade", closing: "Questions? Just reply to this email — we're here to help." },
  sv: { subject: "Välkommen till Forma Estates!", headline: "Välkommen till Forma Estates!", body1: "Tack för att du skapade ett konto. Forma Estates hjälper fastighetsproffs att presentera sina objekt på bästa möjliga sätt med fotorealistiska AI-visualiseringar.", featTitle: "Det här kan du göra med Forma Estates", feats: [["AI-inredningsdesign", "Rumsfoto → fotorealistisk omdesign på sekunder"], ["3D-planlösningar", "2D-ritning → snygg 3D-version"], ["Videor & Showcases", "Före/efter-videor för annonser och sociala medier"], ["AI Design Agent", "Beskriv fritt vad du vill ha — full kreativ frihet"]], upgradeText: "Vill du ha full tillgång till 3D-planlösningar, videor och showcases? <strong style=\"color:#0F1923;\">Uppgradera till en prenumeration</strong> — från 2 999 DKK/mån.", dashCta: "Starta din första design →", priceCta: "Se prenumerationer & uppgradera", closing: "Frågor? Svara på det här mejlet — vi finns här." },
  de: { subject: "Willkommen bei Forma Estates!", headline: "Willkommen bei Forma Estates!", body1: "Danke, dass du ein Konto erstellt hast. Forma Estates hilft Immobilienprofis, ihre Objekte mit fotorealistischen KI-Visualisierungen von ihrer besten Seite zu präsentieren.", featTitle: "Das kannst du mit Forma Estates machen", feats: [["KI-Innenraumdesign", "Raumfoto → fotorealistisches Redesign in Sekunden"], ["3D-Grundrisse", "2D-Plan → tolle 3D-Version"], ["Videos & Showcases", "Vorher/Nachher-Videos für Inserate und Social Media"], ["KI Design Agent", "Beschreibe frei, was du willst — volle kreative Freiheit"]], upgradeText: "Möchtest du vollen Zugang zu 3D-Grundrissen, Videos und Showcases? <strong style=\"color:#0F1923;\">Upgrade auf ein Abonnement</strong> — ab 2.999 DKK/Monat.", dashCta: "Erstes Design starten →", priceCta: "Abonnements ansehen & upgraden", closing: "Fragen? Antworte einfach auf diese E-Mail — wir helfen gerne." },
  nb: { subject: "Velkommen til Forma Estates!", headline: "Velkommen til Forma Estates!", body1: "Takk for at du opprettet en konto. Forma Estates hjelper eiendomsprofesjonelle med å presentere eiendommene sine på sitt aller beste med fotorealistiske AI-visualiseringer.", featTitle: "Det kan du gjøre med Forma Estates", feats: [["AI-interiørdesign", "Romfoto → fotorealistisk redesign på sekunder"], ["3D-plantegninger", "2D-tegning → flott 3D-versjon"], ["Videoer & Showcases", "Før/etter-videoer for annonser og sosiale medier"], ["AI Design Agent", "Beskriv fritt hva du ønsker — full kreativ frihet"]], upgradeText: "Vil du ha full tilgang til 3D-plantegninger, videoer og showcases? <strong style=\"color:#0F1923;\">Oppgrader til et abonnement</strong> — fra 2 999 DKK/mnd.", dashCta: "Start din første design →", priceCta: "Se abonnementer & oppgrader", closing: "Spørsmål? Svar bare på denne e-posten — vi er her." },
  es: { subject: "¡Bienvenido a Forma Estates!", headline: "¡Bienvenido a Forma Estates!", body1: "Gracias por crear una cuenta. Forma Estates ayuda a los profesionales inmobiliarios a presentar sus propiedades en su mejor versión con visualizaciones IA fotorrealistas.", featTitle: "Lo que puedes hacer con Forma Estates", feats: [["Diseño de interiores IA", "Foto de habitación → rediseño fotorrealista en segundos"], ["Planos 3D", "Plano 2D → impresionante versión 3D"], ["Vídeos & Showcases", "Vídeos antes/después para anuncios y redes sociales"], ["AI Design Agent", "Describe libremente lo que quieres — total libertad creativa"]], upgradeText: "¿Quieres acceso completo a planos 3D, vídeos y showcases? <strong style=\"color:#0F1923;\">Actualiza a una suscripción</strong> — desde 2.999 DKK/mes.", dashCta: "Empieza tu primer diseño →", priceCta: "Ver suscripciones y actualizar", closing: "¿Preguntas? Responde a este correo — estamos aquí para ayudarte." },
  fr: { subject: "Bienvenue sur Forma Estates !", headline: "Bienvenue sur Forma Estates !", body1: "Merci d'avoir créé un compte. Forma Estates aide les professionnels de l'immobilier à présenter leurs biens sous leur meilleur jour avec des visualisations IA photoréalistes.", featTitle: "Ce que vous pouvez faire avec Forma Estates", feats: [["Design d'intérieur IA", "Photo de pièce → redesign photoréaliste en quelques secondes"], ["Plans 3D", "Plan 2D → superbe version 3D"], ["Vidéos & Showcases", "Vidéos avant/après pour annonces et réseaux sociaux"], ["AI Design Agent", "Décrivez librement ce que vous souhaitez — liberté créative totale"]], upgradeText: "Vous voulez un accès complet aux plans 3D, vidéos et showcases ? <strong style=\"color:#0F1923;\">Passez à un abonnement</strong> — à partir de 2 999 DKK/mois.", dashCta: "Commencer votre premier design →", priceCta: "Voir les abonnements et mettre à niveau", closing: "Des questions ? Répondez à cet e-mail — nous sommes là pour vous aider." },
};
// ─────────────────────────────────────────────────────────────────────────────

export async function sendVerificationCodeEmail(email: string, code: string, lang?: string | null) {
  const l = normalizeLang(lang ?? undefined);
  const s = VERIFY_STRINGS[l];
  await sendBrevoEmail({
    to: email,
    subject: s.subject(code),
    senderEmail: KONTAKT_EMAIL,
    replyTo: KONTAKT_EMAIL,
    html: `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
        <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
          <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
          <p style="color:#555;font-size:15px;line-height:1.65;margin:18px 0 20px;">${s.intro}</p>
          <div style="text-align:center;margin:24px 0;">
            <span style="display:inline-block;background:#0F1923;color:#fff;font-size:32px;letter-spacing:0.3em;font-weight:700;padding:16px 28px 16px 36px;border-radius:10px;">${code}</span>
          </div>
          <p style="color:#777;font-size:13px;line-height:1.6;margin:20px 0 0;">${s.validity}</p>
        </div>
        <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">${FOOTER[l]}</div>
      </div>
    `,
  });
  log(`Verification code email sent to ${email} (lang: ${l})`);
}

export async function sendPasswordResetEmail(email: string, resetUrl: string, lang?: string | null) {
  const l = normalizeLang(lang ?? undefined);
  const s = RESET_STRINGS[l];
  await sendBrevoEmail({
    to: email,
    subject: s.subject,
    senderEmail: KONTAKT_EMAIL,
    replyTo: KONTAKT_EMAIL,
    html: `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
        <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
          <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
          <p style="color:#555;font-size:15px;line-height:1.65;margin:18px 0 20px;">${s.intro}</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#0F1923;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">${s.button}</a>
          </div>
          <p style="color:#777;font-size:13px;line-height:1.6;margin:20px 0 0;">${s.validity}</p>
          <hr style="border:none;border-top:1px solid #E8DFD0;margin:24px 0 16px;">
          <p style="color:#aaa;font-size:11px;margin:0;">${s.altLink}<br><span style="color:#C9A96E;word-break:break-all;">${resetUrl}</span></p>
        </div>
        <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">${FOOTER[l]}</div>
      </div>
    `,
  });
  log(`Password reset email sent to ${email} (lang: ${l})`);
}

export async function sendWelcomeEmail(email: string, source?: string, lang?: string) {
  const l = normalizeLang(lang);
  const s = WELCOME_STRINGS[l];
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

  const featureRows = s.feats.map(([title, desc]) =>
    `<tr><td style="padding:6px 0;color:#0F1923;font-size:14px;font-weight:600;width:45%;">${title}</td><td style="padding:6px 0;color:#777;font-size:13px;">${desc}</td></tr>`
  ).join("\n");

  // Send welcome + admin notification in parallel — halves total time when
  // using SMTP (each send is a separate TCP round-trip).
  const [welcomeResult, adminResult] = await Promise.allSettled([
    sendBrevoEmail({
      to: email,
      subject: s.subject,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
            <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
            <h1 style="color:#0F1923;font-size:26px;margin:10px 0 18px;font-weight:500;">${s.headline}</h1>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px;">${s.body1}</p>
            <div style="background:#FAF6EC;border:1px solid #E8DFD0;border-radius:10px;padding:20px 22px;margin:0 0 22px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;margin-bottom:10px;">${s.featTitle}</div>
              <table style="width:100%;border-collapse:collapse;">${featureRows}</table>
            </div>
            <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 20px;">${s.upgradeText}</p>
            <p style="text-align:center;margin:26px 0 10px;">
              <a href="https://formaestates.com/boligpotentiale/dashboard"
                 style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                ${s.dashCta}
              </a>
            </p>
            <p style="text-align:center;margin:0 0 24px;">
              <a href="https://formaestates.com/pris"
                 style="background:#C9A96E;color:white;padding:12px 26px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:14px;">
                ${s.priceCta}
              </a>
            </p>
            <p style="color:#777;font-size:13px;line-height:1.6;margin:24px 0 0;">${s.closing}<br/><br/>Forma Estates</p>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">${FOOTER[l]}</div>
        </div>
      `,
    }),
    sendBrevoEmail({
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
    }),
  ]);

  if (welcomeResult.status === "rejected") log(`Failed to send welcome email to ${email}: ${(welcomeResult as PromiseRejectedResult).reason?.message}`);
  else log(`Welcome email sent to ${email} (lang: ${l})`);
  if (adminResult.status === "rejected") log(`Failed to send admin signup notification for ${email}: ${(adminResult as PromiseRejectedResult).reason?.message}`);
  else log(`Admin signup notification sent for ${email}`);
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

export async function sendSubscriptionConfirmationEmail(data: {
  customerEmail: string;
  tierName: string;
  quotas: { ai: number; floorPlans: number; transformVideos: number; showcase: number };
}) {
  const tierColors: Record<string, string> = { Start: "#4A90A4", Pro: "#C8956C", Business: "#0F1923" };
  const color = tierColors[data.tierName] ?? "#0F1923";
  try {
    await sendBrevoEmail({
      to: data.customerEmail,
      subject: `Velkommen til Forma Estates ${data.tierName} — dit abonnement er aktivt`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:${color};padding:24px 28px;">
              <div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · ${data.tierName} Plan</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">✅ Dit abonnement er aktivt!</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 20px;">
                Tak for dit køb. Dit <strong style="color:#0F1923;">Forma Estates ${data.tierName}</strong>-abonnement er nu aktiveret og du har adgang til alle funktioner.
              </p>
              <div style="background:#FAF6EC;border-radius:8px;padding:20px 24px;margin:20px 0;">
                <div style="color:#777;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:14px;font-weight:600;">Din månedlige kvote</div>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:6px 0;color:#555;font-size:14px;">AI-visualiseringer</td><td style="padding:6px 0;color:#0F1923;font-size:14px;font-weight:600;text-align:right;">${data.quotas.ai} stk.</td></tr>
                  <tr><td style="padding:6px 0;color:#555;font-size:14px;">3D Plantegninger</td><td style="padding:6px 0;color:#0F1923;font-size:14px;font-weight:600;text-align:right;">${data.quotas.floorPlans} stk.</td></tr>
                  <tr><td style="padding:6px 0;color:#555;font-size:14px;">Transformeringsvideoer</td><td style="padding:6px 0;color:#0F1923;font-size:14px;font-weight:600;text-align:right;">${data.quotas.transformVideos} stk.</td></tr>
                  <tr><td style="padding:6px 0;color:#555;font-size:14px;">Bolig Showcase-videoer</td><td style="padding:6px 0;color:#0F1923;font-size:14px;font-weight:600;text-align:right;">${data.quotas.showcase} stk.</td></tr>
                </table>
              </div>
              <p style="text-align:center;margin:28px 0;">
                <a href="https://formaestates.com/boligpotentiale/dashboard"
                   style="background:${color};color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                  Gå til dit dashboard →
                </a>
              </p>
              <p style="color:#777;font-size:13px;line-height:1.6;margin:24px 0 0;">
                Spørgsmål? Svar på denne email eller skriv til <a href="mailto:kontakt@formaestates.com" style="color:#C8956C;">kontakt@formaestates.com</a><br/>
                <strong style="color:#0F1923;">Forma Estates</strong>
              </p>
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark</div>
        </div>
      `,
    });
    log(`Subscription confirmation sent to ${data.customerEmail} (${data.tierName})`);
  } catch (err: any) {
    log(`Failed to send subscription confirmation to ${data.customerEmail}: ${err.message}`);
  }

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `💳 Nyt abonnement — ${data.tierName} · ${data.customerEmail}`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Nyt salg</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">💳 Nyt abonnement aktiveret</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;width:160px;border-bottom:1px solid #F0EBE1;">Email</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;">${data.customerEmail}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Plan</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:700;border-bottom:1px solid #F0EBE1;">${data.tierName}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;">Kvote</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;">${data.quotas.ai} AI · ${data.quotas.floorPlans} 3D · ${data.quotas.transformVideos} video · ${data.quotas.showcase} showcase</td></tr>
            </table>
            <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">Forma Estates · Admin notifikation</div>
          </div>
        </div>
      `,
    });
    log(`Admin subscription notification sent for ${data.customerEmail}`);
  } catch (err: any) {
    log(`Failed to send admin subscription notification: ${err.message}`);
  }
}

export async function sendPackageConfirmationEmail(data: {
  customerEmail: string;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  grandTotal: number;
  sessionId: string;
}) {
  const itemRows = data.items
    .filter(i => i.quantity > 0)
    .map(i => `<tr>
      <td style="padding:8px 14px;color:#555;font-size:14px;border-bottom:1px solid #F0EBE1;">${i.name}</td>
      <td style="padding:8px 14px;color:#0F1923;font-size:14px;text-align:center;border-bottom:1px solid #F0EBE1;">${i.quantity} stk.</td>
      <td style="padding:8px 14px;color:#0F1923;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #F0EBE1;">${i.total} kr</td>
    </tr>`).join("");

  try {
    await sendBrevoEmail({
      to: data.customerEmail,
      subject: "Kvittering — Forma Estates pakke købt",
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Kvittering</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">✅ Tak for dit køb!</h1>
            </div>
            <div style="padding:32px 32px 16px;">
              <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 20px;">
                Dit køb er gennemført og dine enheder er tilføjet til din konto.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
                <thead><tr>
                  <th style="padding:8px 14px;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;text-align:left;border-bottom:2px solid #E8DFD0;">Produkt</th>
                  <th style="padding:8px 14px;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;text-align:center;border-bottom:2px solid #E8DFD0;">Antal</th>
                  <th style="padding:8px 14px;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;text-align:right;border-bottom:2px solid #E8DFD0;">Pris</th>
                </tr></thead>
                <tbody>${itemRows}</tbody>
                <tfoot><tr>
                  <td colspan="2" style="padding:12px 14px;color:#0F1923;font-size:15px;font-weight:700;">Total</td>
                  <td style="padding:12px 14px;color:#C8956C;font-size:16px;font-weight:700;text-align:right;">${data.grandTotal} kr</td>
                </tr></tfoot>
              </table>
              <p style="color:#999;font-size:12px;margin:4px 14px 24px;">Ordre: ${data.sessionId.slice(0,20)}…</p>
              <p style="text-align:center;margin:20px 0 28px;">
                <a href="https://formaestates.com/boligpotentiale/dashboard"
                   style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
                  Gå til dit dashboard →
                </a>
              </p>
              <p style="color:#777;font-size:13px;line-height:1.6;margin:0;">
                Spørgsmål? Skriv til <a href="mailto:kontakt@formaestates.com" style="color:#C8956C;">kontakt@formaestates.com</a><br/>
                <strong style="color:#0F1923;">Forma Estates</strong>
              </p>
            </div>
          </div>
          <div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark</div>
        </div>
      `,
    });
    log(`Package confirmation sent to ${data.customerEmail}`);
  } catch (err: any) {
    log(`Failed to send package confirmation to ${data.customerEmail}: ${err.message}`);
  }

  try {
    await sendBrevoEmail({
      to: KONTAKT_EMAIL,
      subject: `📦 Ny pakke købt · ${data.customerEmail} · ${data.grandTotal} kr`,
      senderEmail: KONTAKT_EMAIL,
      replyTo: KONTAKT_EMAIL,
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:640px;margin:0 auto;background:#FAF6EC;padding:32px;">
          <div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E8DFD0;">
            <div style="background:#0F1923;padding:24px 28px;">
              <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates · Nyt salg</div>
              <h1 style="color:#fff;font-size:22px;margin:6px 0 0;font-weight:500;">📦 Ny pakke købt</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;width:160px;border-bottom:1px solid #F0EBE1;">Email</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:500;border-bottom:1px solid #F0EBE1;">${data.customerEmail}</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;border-bottom:1px solid #F0EBE1;">Total</td><td style="padding:10px 14px;color:#0F1923;font-size:14px;font-weight:700;border-bottom:1px solid #F0EBE1;">${data.grandTotal} kr</td></tr>
              <tr><td style="padding:10px 14px;color:#777;font-size:13px;">Session</td><td style="padding:10px 14px;color:#0F1923;font-size:13px;font-family:monospace;">${data.sessionId}</td></tr>
            </table>
            <div style="padding:14px 28px;background:#FAF6EC;border-top:1px solid #E8DFD0;color:#777;font-size:12px;">Forma Estates · Admin notifikation</div>
          </div>
        </div>
      `,
    });
    log(`Admin package notification sent for ${data.customerEmail}`);
  } catch (err: any) {
    log(`Failed to send admin package notification: ${err.message}`);
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

  // If the notification to kontakt@ fails, the whole submission has failed —
  // the caller must know, so we rethrow at the end (confirmation mail is best-effort).
  let adminEmailError: Error | null = null;

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
    adminEmailError = err;
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

  if (adminEmailError) throw adminEmailError;
}

export async function sendPasswordResetToUser(toEmail: string, name: string) {
  try {
    const loginUrl = "https://formaestates.com/login";
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

// ── Onboarding-drip (dag 2 + dag 5) ──────────────────────────────────────────
// Sendes kun til verificerede brugere uden genereringer, som ikke har frameldt
// sig. Afmeld-linket er HMAC-signeret, så ingen kan framelde andre.
import crypto from "crypto";

function unsubscribeSecret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.BREVO_API_KEY || "forma-unsub-fallback";
}

export function unsubscribeSig(userId: number): string {
  return crypto.createHmac("sha256", unsubscribeSecret()).update(String(userId)).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeSig(userId: number, sig: string): boolean {
  const expected = unsubscribeSig(userId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)));
  } catch {
    return false;
  }
}

function unsubscribeFooter(userId: number): string {
  const link = `https://formaestates.com/api/unsubscribe?u=${userId}&sig=${unsubscribeSig(userId)}`;
  return `<div style="text-align:center;color:#999;font-size:11px;margin-top:18px;">© Forma Estates · Danskudviklet i Danmark<br/><a href="${link}" style="color:#999;text-decoration:underline;">Afmeld disse mails</a></div>`;
}

export async function sendOnboardingDay2Email(email: string, name: string | null, userId: number) {
  const greeting = name ? `Hej ${name.split(" ")[0]}` : "Hej";
  await sendBrevoEmail({
    to: email,
    subject: "Dit første AI-billede tager under et minut — Forma Estates",
    senderEmail: KONTAKT_EMAIL,
    replyTo: KONTAKT_EMAIL,
    html: `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
        <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
          <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
          <h1 style="color:#0F1923;font-size:24px;margin:10px 0 18px;font-weight:500;">${greeting} — klar til dit første før/efter?</h1>
          <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 14px;">Du oprettede en konto for et par dage siden, men har ikke lavet din første AI-visualisering endnu. Det tager under et minut:</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <tr><td style="padding:7px 0;color:#0F1923;font-size:14px;"><strong style="color:#C9A96E;">1.</strong>&nbsp; Upload et foto af et rum</td></tr>
            <tr><td style="padding:7px 0;color:#0F1923;font-size:14px;"><strong style="color:#C9A96E;">2.</strong>&nbsp; Vælg rumtype og stil</td></tr>
            <tr><td style="padding:7px 0;color:#0F1923;font-size:14px;"><strong style="color:#C9A96E;">3.</strong>&nbsp; Få et fotorealistisk resultat på ca. 30 sekunder</td></tr>
          </table>
          <p style="color:#555;font-size:15px;line-height:1.65;margin:0 0 20px;">Dine gratis visualiseringer venter stadig på kontoen.</p>
          <p style="text-align:center;margin:26px 0 10px;">
            <a href="https://formaestates.com/boligpotentiale/dashboard"
               style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
              Lav dit første billede →
            </a>
          </p>
          <p style="color:#777;font-size:13px;line-height:1.6;margin:24px 0 0;">Spørgsmål? Svar blot på denne mail.<br/><br/>Venlig hilsen<br/><strong style="color:#0F1923;">Forma Estates</strong></p>
        </div>
        ${unsubscribeFooter(userId)}
      </div>
    `,
  });
  log(`Drip day-2 email sent to ${email}`);
}

export async function sendOnboardingDay5Email(email: string, name: string | null, userId: number) {
  const greeting = name ? `Hej ${name.split(" ")[0]}` : "Hej";
  await sendBrevoEmail({
    to: email,
    subject: "Sådan bruger mæglere AI-visualiseringer til at sælge hurtigere",
    senderEmail: KONTAKT_EMAIL,
    replyTo: KONTAKT_EMAIL,
    html: `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,sans-serif;max-width:600px;margin:0 auto;background:#FAF6EC;padding:32px;">
        <div style="background:#fff;border-radius:10px;padding:36px 32px;border:1px solid #E8DFD0;">
          <div style="color:#C9A96E;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Forma Estates</div>
          <h1 style="color:#0F1923;font-size:24px;margin:10px 0 18px;font-weight:500;">${greeting} — tre måder at bruge Forma Estates i dit salgsarbejde</h1>
          <div style="background:#FAF6EC;border:1px solid #E8DFD0;border-radius:10px;padding:20px 22px;margin:0 0 18px;">
            <div style="color:#0F1923;font-size:14px;font-weight:600;margin-bottom:4px;">Til sælgermødet</div>
            <div style="color:#777;font-size:13px;line-height:1.6;">Vis sælger boligens potentiale med før/efter-billeder — et stærkt argument for at vælge netop dig.</div>
          </div>
          <div style="background:#FAF6EC;border:1px solid #E8DFD0;border-radius:10px;padding:20px 22px;margin:0 0 18px;">
            <div style="color:#0F1923;font-size:14px;font-weight:600;margin-bottom:4px;">I annoncen</div>
            <div style="color:#777;font-size:13px;line-height:1.6;">Tomme eller nedslidte rum skræmmer købere væk. AI-møblering giver købere noget at forelske sig i.</div>
          </div>
          <div style="background:#FAF6EC;border:1px solid #E8DFD0;border-radius:10px;padding:20px 22px;margin:0 0 22px;">
            <div style="color:#0F1923;font-size:14px;font-weight:600;margin-bottom:4px;">Når liggetiden stiger</div>
            <div style="color:#777;font-size:13px;line-height:1.6;">Frisk annoncen op med nye visualiseringer i stedet for at sænke prisen som første træk.</div>
          </div>
          <p style="text-align:center;margin:26px 0 10px;">
            <a href="https://formaestates.com/boligpotentiale/dashboard"
               style="background:#0F1923;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px;">
              Prøv det med et af dine egne fotos →
            </a>
          </p>
          <p style="color:#777;font-size:13px;line-height:1.6;margin:24px 0 0;">Venlig hilsen<br/><strong style="color:#0F1923;">Forma Estates</strong></p>
        </div>
        ${unsubscribeFooter(userId)}
      </div>
    `,
  });
  log(`Drip day-5 email sent to ${email}`);
}

