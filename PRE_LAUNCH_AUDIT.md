# Forma Estates — Komplet systemtjek før lancering
_Gennemført: 5. august 2026_

---

## Resumé

| Kategori | Status |
|---|---|
| Brugeroprettelse & login | ✅ Fungerer |
| Aktivering & email-verifikation | ✅ Fungerer |
| Dataisolering (brugere ser kun egne data) | ✅ Fungerer (2 kritiske huller lukket) |
| Feature-gating (betalte funktioner) | ✅ Fungerer |
| Sprog & auto-detektion | ✅ Fungerer |
| Dashboard-oversættelse | 🟡 Delvist (stats-paneler, season-knapper stadig dansk) |
| Emails | 🟡 Aktivering/reset OK — velkomst/abonnement mangler sprog |
| AI boligvisualisering | ✅ Fungerer |
| AI Design Agent | ✅ Fungerer |
| 3D plantegning | ✅ Fungerer (BETA) |
| Transformationsvideo | ✅ Fungerer (restart-risiko) |
| Showcase video | ✅ Fungerer (restart-risiko) |
| 3D viewer | ✅ Fungerer (BETA) |
| Før/efter slider | ✅ Fungerer |
| Download | ✅ Fungerer |
| Deling | ✅ Fungerer |
| Betaling (Stripe) | 🟡 Fungerer — valuta-issue sporet i task #26 |
| GDPR & juridisk | 🔴 Cookie-samtykke mangler, juridiske sider kun dansk |
| Mobil | ✅ Fungerer (minor knap-issues sporet) |

---

## 🔴 KRITISKE PROBLEMER — SKAL FIXES FØR LANCERING

### 1. ~~GET /api/designs var uautoriseret~~ ✅ FIXED
**Beskrivelse:** `/api/designs` returnerede ALLE brugeres designs uden login-krav. Enhver kunne hente hele databasen med designresultater og billeder.  
**Fix:** Endpointet kræver nu admin-token. Almindelige brugere får 403.  
**Fil:** `server/routes.ts:1221`

### 2. ~~GET /api/designs/:id/status manglede auth-tjek~~ ✅ FIXED
**Beskrivelse:** Status-endpointet returnerede completed design data (inkl. `resultUrl`, `versions`) uden at tjekke hvem der spurgte. Enhver med et gættet ID kunne hente resultater.  
**Fix:** Kræver nu Firebase-token + ejeropcheck (eller admin-bypass).  
**Fil:** `server/routes.ts:1247`

### 3. Cookie-samtykke mangler
**Beskrivelse:** Der er ingen cookie consent-løsning på sitet. Dette er et krav under GDPR og ePrivacy-direktivet, specielt når siden skalerer til EU-lande.  
**Fix nødvendig:** Implementer en cookie-banner (f.eks. via Cookiebot, CookieYes eller custom).

### 4. Juridiske sider er kun på dansk
**Beskrivelse:** Privatlivspolitik, handelsbetingelser og abonnementsvilkår er udelukkende på dansk. Tyske, svenske, engelske og andre brugere præsenteres for dansk juridisk tekst.  
**Fix nødvendig:** Oversæt juridiske sider til minimum engelsk, eller tilføj en disclaimer om at dansk ret gælder.

---

## 🟡 ALVORLIGE PROBLEMER — BØR FIXES FØR LANCERING

### 5. 5 gratis korrektioner i boligvisualisering er kun klient-enforced
**Beskrivelse:** AI Design Agent har korrekt server-side enforcement af 5 gratis justeringer. Men for normal boligvisualisering (ikke agent) tjekker serveren ikke om brugeren har brugt sine 5 gratis. En teknisk bruger kan omgå grænsen ved at kalde API'et direkte.  
**Fil:** `server/routes.ts:~3259` — kommentar i koden siger "server skips quota"  
**Fix:** Tilføj server-side tæller for bolig-korrektioner identisk med agent-implementeringen.

### 6. In-memory job-registry mistes ved server-genstart
**Beskrivelse:** Transformationsvideo og Showcase-video bruger in-memory Maps til at spore igangværende jobs og eventuelle refunds. Hvis serveren genstarter (f.eks. Render deploy), mister systemet styr på igangværende jobs — brugere sidder med spinner for evigt og credits refunderes ikke.  
**Filer:** `server/showcase.ts`, `server/fal.ts`  
**Fix:** Flyt job-state til databasen (en `video_jobs`-tabel), eller tilføj boot-time reset der markerer "generating"-rows som failed.

### 7. Admin-routes bruger password i query string
**Beskrivelse:** `/api/admin/bootstrap`, `/api/admin/stats`, `/api/admin/login` bruger et shared `ADMIN_PASSWORD` sendt i query eller body. Query-passwords vises i server-logs og browser-historik.  
**Fix:** Migrer til Firebase-admin auth + `user.isAdmin` check, som resten af platformen.

### 8. Velkomstmail og abonnements-emails sendes ikke på brugerens sprog
**Beskrivelse:** Aktiverings- og password-reset-emails er oversat. Men velkomstmail (task #43) og abonnements-bekræftelser er ikke. Brugere fra Sverige/Tyskland/Norge modtager disse på dansk.  
**Sporet:** Task #43 "Translate welcome and subscription confirmation emails"

### 9. Udvalgte dashboard-tekster er stadig hardkodet dansk
**Beskrivelse:** Følgende er ikke endnu i18n'et i dashboardet:
- Stats-paneler ("Aktive sager", "Visuals md.", "Gns. tid", "Solgte sager", "Sager i alt", "Dage på marked", "Medlemmer")
- Season-knapper ("Forår", "Sommer" osv.)
- "Hurtige handlinger" sektion-titel
- AI Design Agent textarea placeholder (eksempel-prompts på dansk)
- ROOM_NAME_SUGGESTIONS i 3D plantegning
**Sporet:** Task #50 "Translate the entire dashboard into all 7 languages"

### 10. Before/After slider-labels er hardkodet dansk i dele af UI
**Beskrivelse:** Slider-labels ("Før"/"Efter") er hardkodet danske i mobile hero-sektionen.  
**Sporet:** Task #41

---

## 🟠 KENDTE MANGLER (SPORET I EKSISTERENDE TASKS)

| # | Beskrivelse | Task |
|---|---|---|
| Sprog-switcher mangler på Examples og About | Task #42 |
| Stripe opkræver i USD (burde være DKK) | Task #26 |
| Aktivering via Brevo API (ikke SMTP) | Task #27 |
| Password-nulstilling i produktion | Task #32 |
| Auto-deploy Replit → GitHub | Task #16 |
| ES/FR i aktiverings- og password-emails | Task #47 |
| Velkomst- og abonnements-emails på brugerens sprog | Task #43 |
| Sprog-præference gemt i DB | Task #44 |

---

## ✅ HVAD DER FUNGERER

### Brugeroprettelse & login
- Firebase-baseret auth fungerer (email/password + Google)
- Server provisioning via `/api/auth/verify` med token-validering
- Aktiverings-flow: 6-cifret kode, SHA-256 hash, 15 min. udløb, 5 forsøg max, 60s cooldown på resend
- Data-isolation: brugere ser kun egne sager, designs og billeder (efter security-fix ovenfor)
- Rollebaseret adgang: admin-bypass fungerer korrekt

### Sprog & auto-detektion
- 7 sprog: DA, EN, SV, DE, NB, ES, FR
- Auto-detektion: `Accept-Language` header → `fe-locale` cookie → browser-sprog
- Manuel sprogswitcher fungerer og husker valget i localStorage
- Norsk `no`/`nn` normaliseres korrekt til `nb`

### AI boligvisualisering
- Upload (multer, 10MB, type-validering) ✅
- Collov API-generering med async polling ✅
- Resultat gemmes til case og galleri ✅
- Historik-panel med regenerering ✅
- Deling via tokeniserede links ✅

### AI Design Agent
- Upload + prompt-flow ✅
- 5 gratis justeringer server-enforced ✅
- Credits trækkes korrekt ved betalt brug ✅
- Before/after vises i agent-resultater ✅

### 3D Plantegning
- Fal.ai-generering fra foto ✅
- Tripo3D 3D-model generering ✅
- In-browser orbit-viewer (Three.js) ✅
- Download af GLB og rendered PNG ✅
- Gemmes til case ✅

### Transformationsvideo & Showcase
- Kling/fal video-generering ✅
- Showcase-video med musik og kameraeffekter ✅
- Download af MP4 ✅
- Quota-gating og refunds ved fejl ✅

### Betaling
- Stripe webhooks med signature-validering ✅
- Abonnements-tiers (free trial → paid plans) ✅
- Credits/quota system med per-feature gating ✅
- Annullering og reactivering ✅
- DKK på recurring subscriptions ✅ (engangskøb undersøges — task #26)

### Design & UX
- Responsivt layout (mobil + desktop) ✅
- Hero CTA-knap kortere på mobil ✅ (task #36 implementeret)
- Antes/efter slider med keyboard og ARIA ✅
- Proressiv loading og skeleton states ✅

### EU AI Act compliance
- Synlig EU AI Act badge på AI-genererede billeder ✅
- XMP/C2PA metadata i downloadede billeder ✅
- Invisible steganographic watermark ✅
- Download-proxy sikrer at badges ikke omgås ✅

---

## 🟢 KAN FORBEDRES SENERE

1. **Rate limiting** — Ingen global rate limiting på API-endpoints. Tilføj f.eks. express-rate-limit på auth-endpoints og genererings-endpoints.
2. **Attempt-tæller race condition** — Verify-code endpoint opdaterer attempt-tæller med read-then-write (ikke atomisk). Lav risiko, men bør hardnes med en conditional update.
3. **Tripo/fal URL-expiry** — Genererede modeller og videoer fra eksterne APIs har tidsbegrænsede URLs. Systemet forsøger at lokalisere dem til R2/disk, men fallback til remote URL kan fejle efter ~9 timer. Bør logges og monitores.
4. **3D viewer CDN-afhængighed** — Three.js og Draco-decoder loades fra jsDelivr/gstatic i standalone viewer. Overvej at bundle lokalt for offline-robusthed.
5. **Juridiske sider på andre sprog** — Nuværende privatlivspolitik og vilkår er kun dansk. Til fuld international lancering: oversæt eller tilføj "gælder under dansk ret"-disclaimer på alle sprog.
6. **Marketing-emails** — Ingen marketing-email-templates er identificeret i kodebasen. Konfigurer via Brevo-kampagner eksternt.
7. **Quota-beskeder** — Ingen automatisk notifikation når bruger nærmer sig/rammer sin kvota. Overvej at sende en "80% brugt"-email.

---

## Handlingsplan: Skal fixes FØR lancering

| Prioritet | Problem | Status |
|---|---|---|
| 🔴 KRITISK | GET /api/designs uautoriseret | ✅ FIXED nu |
| 🔴 KRITISK | GET /api/designs/:id/status ingen auth | ✅ FIXED nu |
| 🔴 KRITISK | Cookie-samtykke mangler | ❌ Ikke implementeret |
| 🔴 KRITISK | Juridiske sider kun på dansk | ❌ Ikke implementeret |
| 🟡 ALVORLIG | 5 gratis korrektioner client-only | ❌ Server-fix mangler |
| 🟡 ALVORLIG | In-memory job-registry | ❌ Vedvarende state mangler |
| 🟡 ALVORLIG | Admin-routes med password i query | ❌ Skal migreres |
| 🟡 ALVORLIG | Velkomst/abonnements-emails mangler oversættelse | 📋 Task #43 |
| 🟡 ALVORLIG | Dashboard stats stadig dansk | 📋 Task #50 |
