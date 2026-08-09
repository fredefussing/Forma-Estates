import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailCheck, ArrowLeft } from "lucide-react";

type Lang = "da" | "en" | "sv" | "de" | "nb" | "es" | "fr";

const VL: Record<Lang, {
  title: string; subtitle: (email: string) => JSX.Element;
  verifying: string; verify: string; noCode: string;
  resendIn: (s: number) => string; resend: string;
  spamNote: string; back: string; codeSent: string;
  waitMsg: string; sendFailed: string; connFailed: string;
  verifyFailed: string; connVerifyFailed: string; verified: string;
  noActiveCode: string; codeExpired: string; tooManyAttempts: string;
  wrongCodeNeedsNew: string; wrongCodeLeft: (n: number) => string;
}> = {
  da: {
    title: "Bekræft din email",
    subtitle: (e) => <><strong className="text-foreground">{e}</strong> — indtast den 6-cifrede kode vi har sendt.</>,
    verifying: "Bekræfter...", verify: "Bekræft kode",
    noCode: "Fik du ikke koden?",
    resendIn: (s) => `Send igen om ${s} sek.`,
    resend: "Send ny kode",
    spamNote: "Tjek også din spam-mappe. Koden er gyldig i 15 minutter.",
    back: "Tilbage til opret (skrev du forkert email?)",
    codeSent: "Ny kode sendt! Tjek din indbakke.",
    waitMsg: "Vent et øjeblik før du beder om en ny kode.",
    sendFailed: "Kunne ikke sende koden. Prøv igen.",
    connFailed: "Kunne ikke sende koden. Tjek din forbindelse og prøv igen.",
    verifyFailed: "Forkert kode. Prøv igen.",
    connVerifyFailed: "Der skete en fejl. Prøv igen.",
    verified: "Email bekræftet! Sender dig videre...",
    noActiveCode: "Ingen aktiv kode. Bed om en ny kode.",
    codeExpired: "Koden er udløbet. Bed om en ny kode.",
    tooManyAttempts: "For mange forsøg. Bed om en ny kode.",
    wrongCodeNeedsNew: "Forkert kode. Bed om en ny kode.",
    wrongCodeLeft: (n) => `Forkert kode. ${n} forsøg tilbage.`,
  },
  en: {
    title: "Verify your email",
    subtitle: (e) => <>We sent a 6-digit code to <strong className="text-foreground">{e}</strong>. Enter it here to activate your account.</>,
    verifying: "Verifying...", verify: "Verify code",
    noCode: "Didn't receive the code?",
    resendIn: (s) => `Resend in ${s}s`,
    resend: "Resend code",
    spamNote: "Also check your spam folder. The code is valid for 15 minutes.",
    back: "Back to sign up (wrong email?)",
    codeSent: "New code sent! Check your inbox.",
    waitMsg: "Please wait before requesting a new code.",
    sendFailed: "Could not send the code. Please try again.",
    connFailed: "Could not send the code. Check your connection and try again.",
    verifyFailed: "Incorrect code. Please try again.",
    connVerifyFailed: "Something went wrong. Please try again.",
    verified: "Email verified! Redirecting...",
    noActiveCode: "No active code. Please request a new code.",
    codeExpired: "Code expired. Please request a new code.",
    tooManyAttempts: "Too many attempts. Please request a new code.",
    wrongCodeNeedsNew: "Incorrect code. Please request a new code.",
    wrongCodeLeft: (n) => `Incorrect code. ${n} attempt${n === 1 ? "" : "s"} remaining.`,
  },
  sv: {
    title: "Bekräfta din e-post",
    subtitle: (e) => <>Vi skickade en 6-siffrig kod till <strong className="text-foreground">{e}</strong>. Ange den här för att aktivera ditt konto.</>,
    verifying: "Verifierar...", verify: "Bekräfta kod",
    noCode: "Fick du inte koden?",
    resendIn: (s) => `Skicka igen om ${s}s`,
    resend: "Skicka ny kod",
    spamNote: "Kontrollera även skräpposten. Koden är giltig i 15 minuter.",
    back: "Tillbaka till registrering (fel e-post?)",
    codeSent: "Ny kod skickad! Kolla inkorgen.",
    waitMsg: "Vänta ett ögonblick innan du begär en ny kod.",
    sendFailed: "Det gick inte att skicka koden. Försök igen.",
    connFailed: "Det gick inte att skicka koden. Kontrollera din anslutning.",
    verifyFailed: "Fel kod. Försök igen.",
    connVerifyFailed: "Något gick fel. Försök igen.",
    verified: "E-post verifierad! Omdirigerar...",
    noActiveCode: "Ingen aktiv kod. Begär en ny kod.",
    codeExpired: "Koden har gått ut. Begär en ny kod.",
    tooManyAttempts: "För många försök. Begär en ny kod.",
    wrongCodeNeedsNew: "Fel kod. Begär en ny kod.",
    wrongCodeLeft: (n) => `Fel kod. ${n} försök kvar.`,
  },
  de: {
    title: "E-Mail bestätigen",
    subtitle: (e) => <>Wir haben einen 6-stelligen Code an <strong className="text-foreground">{e}</strong> gesendet. Gib ihn hier ein, um dein Konto zu aktivieren.</>,
    verifying: "Wird bestätigt...", verify: "Code bestätigen",
    noCode: "Keinen Code erhalten?",
    resendIn: (s) => `Erneut senden in ${s}s`,
    resend: "Neuen Code senden",
    spamNote: "Überprüfe auch deinen Spam-Ordner. Der Code ist 15 Minuten gültig.",
    back: "Zurück zur Registrierung (falsche E-Mail?)",
    codeSent: "Neuer Code gesendet! Überprüfe deinen Posteingang.",
    waitMsg: "Bitte warte, bevor du einen neuen Code anforderst.",
    sendFailed: "Code konnte nicht gesendet werden. Bitte erneut versuchen.",
    connFailed: "Code konnte nicht gesendet werden. Verbindung prüfen.",
    verifyFailed: "Falscher Code. Bitte erneut versuchen.",
    connVerifyFailed: "Ein Fehler ist aufgetreten. Bitte erneut versuchen.",
    verified: "E-Mail bestätigt! Weiterleitung...",
    noActiveCode: "Kein aktiver Code. Bitte neuen Code anfordern.",
    codeExpired: "Code abgelaufen. Bitte neuen Code anfordern.",
    tooManyAttempts: "Zu viele Versuche. Bitte neuen Code anfordern.",
    wrongCodeNeedsNew: "Falscher Code. Bitte neuen Code anfordern.",
    wrongCodeLeft: (n) => `Falscher Code. Noch ${n} Versuch${n === 1 ? "" : "e"}.`,
  },
  nb: {
    title: "Bekreft e-postadressen",
    subtitle: (e) => <>Vi sendte en 6-sifret kode til <strong className="text-foreground">{e}</strong>. Skriv den inn her for å aktivere kontoen din.</>,
    verifying: "Bekrefter...", verify: "Bekreft kode",
    noCode: "Fikk du ikke koden?",
    resendIn: (s) => `Send igjen om ${s}s`,
    resend: "Send ny kode",
    spamNote: "Sjekk også spam-mappen. Koden er gyldig i 15 minutter.",
    back: "Tilbake til registrering (feil e-post?)",
    codeSent: "Ny kode sendt! Sjekk innboksen din.",
    waitMsg: "Vent litt før du ber om en ny kode.",
    sendFailed: "Kunne ikke sende koden. Prøv igjen.",
    connFailed: "Kunne ikke sende koden. Sjekk tilkoblingen din.",
    verifyFailed: "Feil kode. Prøv igjen.",
    connVerifyFailed: "Noe gikk galt. Prøv igjen.",
    verified: "E-post bekreftet! Omdirigerer...",
    noActiveCode: "Ingen aktiv kode. Be om en ny kode.",
    codeExpired: "Koden er utgått. Be om en ny kode.",
    tooManyAttempts: "For mange forsøk. Be om en ny kode.",
    wrongCodeNeedsNew: "Feil kode. Be om en ny kode.",
    wrongCodeLeft: (n) => `Feil kode. ${n} forsøk igjen.`,
  },
  es: {
    title: "Verifica tu correo electrónico",
    subtitle: (e) => <>Hemos enviado un código de 6 dígitos a <strong className="text-foreground">{e}</strong>. Introdúcelo aquí para activar tu cuenta.</>,
    verifying: "Verificando...", verify: "Verificar código",
    noCode: "¿No recibiste el código?",
    resendIn: (s) => `Reenviar en ${s}s`,
    resend: "Reenviar código",
    spamNote: "Revisa también tu carpeta de spam. El código es válido durante 15 minutos.",
    back: "Volver al registro (¿correo incorrecto?)",
    codeSent: "¡Nuevo código enviado! Revisa tu bandeja de entrada.",
    waitMsg: "Espera un momento antes de solicitar un nuevo código.",
    sendFailed: "No se pudo enviar el código. Inténtalo de nuevo.",
    connFailed: "No se pudo enviar el código. Comprueba tu conexión.",
    verifyFailed: "Código incorrecto. Inténtalo de nuevo.",
    connVerifyFailed: "Algo salió mal. Inténtalo de nuevo.",
    verified: "¡Correo verificado! Redirigiendo...",
    noActiveCode: "No hay ningún código activo. Solicita uno nuevo.",
    codeExpired: "El código ha caducado. Solicita uno nuevo.",
    tooManyAttempts: "Demasiados intentos. Solicita un nuevo código.",
    wrongCodeNeedsNew: "Código incorrecto. Solicita un nuevo código.",
    wrongCodeLeft: (n) => `Código incorrecto. Quedan ${n} intento${n === 1 ? "" : "s"}.`,
  },
  fr: {
    title: "Vérifiez votre adresse e-mail",
    subtitle: (e) => <>Nous avons envoyé un code à 6 chiffres à <strong className="text-foreground">{e}</strong>. Entrez-le ici pour activer votre compte.</>,
    verifying: "Vérification...", verify: "Vérifier le code",
    noCode: "Vous n'avez pas reçu le code ?",
    resendIn: (s) => `Renvoyer dans ${s}s`,
    resend: "Renvoyer le code",
    spamNote: "Vérifiez également vos spams. Le code est valable 15 minutes.",
    back: "Retour à l'inscription (mauvaise adresse ?)",
    codeSent: "Nouveau code envoyé ! Vérifiez votre boîte de réception.",
    waitMsg: "Attendez un moment avant de demander un nouveau code.",
    sendFailed: "Impossible d'envoyer le code. Veuillez réessayer.",
    connFailed: "Impossible d'envoyer le code. Vérifiez votre connexion.",
    verifyFailed: "Code incorrect. Veuillez réessayer.",
    connVerifyFailed: "Une erreur est survenue. Veuillez réessayer.",
    verified: "E-mail vérifié ! Redirection en cours...",
    noActiveCode: "Aucun code actif. Veuillez en demander un nouveau.",
    codeExpired: "Le code a expiré. Veuillez en demander un nouveau.",
    tooManyAttempts: "Trop de tentatives. Veuillez demander un nouveau code.",
    wrongCodeNeedsNew: "Code incorrect. Veuillez demander un nouveau code.",
    wrongCodeLeft: (n) => `Code incorrect. Il reste ${n} tentative${n === 1 ? "" : "s"}.`,
  },
};

function getLang(): Lang {
  const stored = (localStorage.getItem("forma-lang") || "da").toLowerCase().split("-")[0];
  const supported: Lang[] = ["da", "en", "sv", "de", "nb", "es", "fr"];
  return (supported.includes(stored as Lang) ? stored : "da") as Lang;
}

export default function VerifyEmailPage() {
  const { user, loading: authLoading, emailVerified, refreshVerification } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sentRef = useRef(false);
  const leavingRef = useRef(false);
  const [, setLocation] = useLocation();
  const s = VL[getLang()];

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "/boligpotentiale/dashboard";

  // Not logged in → login. Already verified → onwards.
  useEffect(() => {
    if (leavingRef.current) return;
    if (!authLoading && !user) setLocation("/login?redirect=/boligpotentiale/dashboard");
    if (!authLoading && user && emailVerified === true) setLocation(redirect);
  }, [user, authLoading, emailVerified, setLocation, redirect]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async (isResend: boolean) => {
    if (!user) return;
    setError("");
    try {
      const token = await user.getIdToken();
      const lang = localStorage.getItem("forma-lang") || undefined;
      const res = await fetch("/api/auth/send-verification-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadyVerified) {
          await refreshVerification();
          setLocation(redirect);
          return;
        }
        setInfo(isResend ? s.codeSent : "");
        setResendCooldown(60);
      } else if (res.status === 429 && data.retryAfterSeconds) {
        setResendCooldown(data.retryAfterSeconds);
        if (isResend) setError(s.waitMsg);
      } else {
        setError(s.sendFailed);
      }
    } catch {
      setError(s.connFailed);
    }
  };

  // Send the first code automatically when the page loads
  useEffect(() => {
    if (user && emailVerified === false && !sentRef.current) {
      sentRef.current = true;
      sendCode(false);
    }
  }, [user, emailVerified]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || verifying) return;
    setError("");
    setInfo("");
    setVerifying(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInfo(s.verified);
        await refreshVerification();
        setLocation(redirect);
      } else {
        const errCode = data.code as string | undefined;
        if (errCode === "no_active_code") setError(s.noActiveCode);
        else if (errCode === "expired") setError(s.codeExpired);
        else if (errCode === "too_many_attempts") setError(s.tooManyAttempts);
        else if (errCode === "wrong_code") {
          setError(data.needsNewCode ? s.wrongCodeNeedsNew : s.wrongCodeLeft(data.attemptsLeft ?? 1));
        } else {
          setError(s.verifyFailed);
        }
        if (data.needsNewCode) setCode("");
      }
    } catch {
      setError(s.connVerifyFailed);
    } finally {
      setVerifying(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen" style={{ background: "#f5f5f0" }} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[420px]">
        <Link href="/">
          <span className="text-xl font-bold text-center block mb-6 cursor-pointer text-[#1a1a1a]" data-testid="link-logo">
            Forma Estates
          </span>
        </Link>

        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#f5f5f0] flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-[#C8956C]" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-1" data-testid="text-title">{s.title}</h1>
        <p className="text-center text-muted-foreground mb-8" data-testid="text-subtitle">
          {s.subtitle(user.email ?? "")}
        </p>

        <form onSubmit={handleVerify} className="space-y-5">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl tracking-[0.5em] h-14 font-semibold"
            data-testid="input-verification-code"
          />

          <Button type="submit" className="w-full h-12 text-base" disabled={verifying || code.length !== 6} data-testid="button-verify-code">
            {verifying ? s.verifying : s.verify}
          </Button>

          {error && <p className="text-destructive text-sm text-center" data-testid="text-error">{error}</p>}
          {info && <p className="text-green-600 text-sm text-center" data-testid="text-info">{info}</p>}
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          {s.noCode}{" "}
          {resendCooldown > 0 ? (
            <span data-testid="text-resend-cooldown">{s.resendIn(resendCooldown)}</span>
          ) : (
            <button
              type="button"
              onClick={() => sendCode(true)}
              className="text-[#1a1a1a] underline cursor-pointer font-medium"
              data-testid="button-resend-code"
            >
              {s.resend}
            </button>
          )}
        </p>
        <p className="text-center mt-2 text-xs text-muted-foreground">{s.spamNote}</p>

        <button
          type="button"
          onClick={async () => {
            leavingRef.current = true;
            try { await signOut(auth); } catch {}
            setLocation("/opret");
          }}
          className="flex items-center justify-center gap-1.5 mt-5 w-full text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          data-testid="button-back-to-signup"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.back}
        </button>
      </div>
    </div>
  );
}
