// ── Onboarding-drip scheduler ─────────────────────────────────────────────────
// Kører et dagligt sweep, der sender dag-2 og dag-5 mails til nye brugere, som
// endnu ikke har genereret noget. Ledger-rækken (drip_emails) skrives FØR
// afsendelse, så en mail aldrig kan sendes dobbelt — heller ikke hvis flere
// instanser kører samtidig (Render + dev deler ikke DB, men Render kan
// genstarte midt i et sweep).
import { storage } from "./storage";
import { sendOnboardingDay2Email, sendOnboardingDay5Email } from "./email";

function log(message: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [drip] ${message}`);
}

const DRIPS: Array<{
  key: string;
  minAgeDays: number;
  maxAgeDays: number;
  send: (email: string, name: string | null, userId: number) => Promise<void>;
}> = [
  // Max-alder forhindrer, at gamle konti får onboarding-mails, når featuren lanceres
  { key: "onboarding-day2", minAgeDays: 2, maxAgeDays: 14, send: sendOnboardingDay2Email },
  { key: "onboarding-day5", minAgeDays: 5, maxAgeDays: 17, send: sendOnboardingDay5Email },
];

export async function runDripSweep(): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const drip of DRIPS) {
    let candidates: Array<{ id: number; email: string; displayName: string | null }>;
    try {
      candidates = await storage.getDripCandidates(drip.key, drip.minAgeDays, drip.maxAgeDays);
    } catch (e: any) {
      log(`${drip.key}: candidate query failed — ${e.message}`);
      continue;
    }
    for (const c of candidates) {
      // Ledger FØRST — hvis rækken allerede findes, er mailen sendt (eller ved
      // at blive sendt af en anden instans) og vi springer over.
      const claimed = await storage.recordDripEmail(c.id, drip.key).catch(() => false);
      if (!claimed) { skipped++; continue; }
      try {
        await drip.send(c.email, c.displayName, c.id);
        sent++;
      } catch (e: any) {
        log(`${drip.key} → ${c.email} failed: ${e.message}`);
        // Ledger-rækken bliver stående: hellere én mistet mail end spam ved
        // gentagne fejl (f.eks. permanent ugyldig adresse).
      }
    }
  }
  if (sent > 0 || skipped > 0) log(`sweep done: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

export function startDripScheduler() {
  // Emails kræver Brevo (eller SMTP) — uden nøgle er sweepet meningsløst
  if (!process.env.BREVO_API_KEY && !process.env.SMTP_PASSWORD) {
    log("no BREVO_API_KEY/SMTP_PASSWORD — drip scheduler disabled");
    return;
  }
  // Første sweep kort efter boot, derefter hver 12. time
  setTimeout(() => { runDripSweep().catch((e) => log(`sweep error: ${e.message}`)); }, 20_000);
  setInterval(() => { runDripSweep().catch((e) => log(`sweep error: ${e.message}`)); }, 12 * 60 * 60 * 1000);
  log("drip scheduler started (every 12h)");
}
