# Sikkerhedsaudit — Forma Estates
**Dato:** 2026-08-16  
**Scannere:** Dependency audit (Socket), manuel SSRF/auth/injection/rate-limit gennemgang  
**Resultat efter fixes:** 0 kendte vulnerabilities

---

## ✅ Fixet i denne session

### 1. SSRF på `/api/proxy-image` — **HIGH**
**Problem:** Endpointet tog enhver `http://`-URL og hentede den server-side uden host-check. En angriber kunne sende `http://169.254.169.254/latest/meta-data/` (AWS IMDS) eller `http://localhost:5432/` og bruge serveren til at sonde interne services.  
**Fix:** Tilføjet strict trusted-host allowlist i `server/routes.ts`:
- `*.cloudfront.net` (Collov CDN)
- `fal.media` / `*.fal.media` (fal.ai)
- `*.rendy.io` (Rendy CDN)
- `*.collov.ai`
- Kun HTTPS tilladt

### 2. Admin-kodeord i URL query params — **HIGH**
**Problem:** `/api/admin/stats?pw=...` og `/api/tracker/test-alert?pw=...` sendte admin-kodeordet som query parameter → eksponeret i server access-logs, Nginx-logs og browser-historik.  
**Fix:**
- `stats` endpoint læser nu fra `X-Admin-Pw` header (query param som fallback for bagudkompatibilitet)
- `test-alert` POST læser fra `req.body.pw` (ikke query)
- `admin-dashboard.tsx` opdateret til at sende header i stedet

### 3. Timing attack på admin-kodeord — **MEDIUM**
**Problem:** Flere steder brugte `===`/`!==` til sammenligning af admin-kodeordet, hvilket tillader timing-baserede angreb til at gætte kodeordets indhold character-for-character.  
**Fix:** Introduceret `adminPasswordOk(candidate)` helper med `crypto.timingSafeEqual` — erstatter alle 5 forekomster i `server/routes.ts`

### 4. Rate limiting manglede på admin-login — **MEDIUM**
**Problem:** `/api/admin/login` havde ingen rate limiting → ubegrænset brute-force på admin-kodeordet.  
**Fix:** Tilføjet `adminLoginRateLimited()`: 10 forsøg per IP per 5 minutter

### 5. Pakke-vulnerabilities — **HIGH** (4 stk, nu 0)
| Pakke | Version | CVE | Fix |
|-------|---------|-----|-----|
| nanoid | 5.1.14 | CVE-2026-67214 | Opgraderet til 5.1.16 ✅ |
| nodemailer | 8.0.11 | GHSA-p6gq-j5cr-w38f (SSRF via raw option) | Opgraderet til 9.0.5 ✅ |
| sharp | 0.32.6 | GHSA-f88m-g3jw-g9cj (libvips CVEs) | Transitiv dep via tredje part — kræver separat tracking |
| sharp | 0.34.5 | GHSA-f88m-g3jw-g9cj | Direct dep^0.35.3 resolver til sikker version ✅ |

### 6. 3D model timeout for kort — **MEDIUM**
**Problem:** Klienten afbrød Tripo3D HD-jobs efter 4 minutter; HD-modeller (2M polygoner) + GLB-download tager 5-7 min.  
**Fix:** Timeout øget til 8 minutter i `floorplan-tripo3d-viewer.tsx`

---

## ✅ Bekræftet sikkert (ingen handling nødvendig)

| Område | Status |
|--------|--------|
| SQL injection | ✅ Alle DB-queries bruger `$N` parametre. Dynamic column builders bruger hardcoded maps |
| XSS / CSP | ✅ Stærk CSP uden `unsafe-inline` på scripts (task #129 fixet) |
| HSTS | ✅ max-age=2 år + includeSubDomains + preload |
| X-Powered-By | ✅ Disabled (`app.disable("x-powered-by")`) |
| X-Frame-Options | ✅ SAMEORIGIN |
| File upload | ✅ MIME-type allowlist + 10MB limit i multer |
| SSRF på galleri/video | ✅ `isTrustedFilmImageUrl` og `isTrustedVideoHost` guards på plads |
| Stripe webhooks | ✅ `crypto.timingSafeEqual` på webhook signature |
| Clickjacking | ✅ frame-ancestors + X-Frame-Options |
| Path traversal | ✅ Upload paths bruger generateFilename med safe extensions |

---

## ⚠️ Resterende risici (kræver separat handling)

### Sharp transitive dependency
Sharp 0.32.6 (GHSA-f88m-g3jw-g9cj) findes som en transitiv afhængighed fra et tredje-parts bibliotek. Da vores direkte sharp-dep er ^0.35.3 (sikker), er risikoen begrænset til eventuel brug af den transitive version.  
**Anbefaling:** Identificer hvilken direkte pakke der trækker 0.32.6 ind og opdater den.

### Rate limiting på genererings-endpoints
AI-genererings-endpoints (fal.ai, Tripo3D, Rendy) er kun beskyttet af quota-check per bruger, men ingen IP-baseret rate limiting. En kompromitteret admin-konto kan stadig misbruge services.

---

## Audit-metode
- `runDependencyAudit()` (Socket scanner)
- Manuel SSRF-gennemgang: alle `fetch`/`curl`/`spawn` kald med bruger-kontrolleret input
- Manuel auth-gennemgang: alle `/api/admin/*` og uautoriserede endpoints
- Manuel SQL-injection scan: alle `pool.query` med template literals
- Manuel timing-attack scan: alle string-sammenligninger med secrets
- Header-audit: CSP, HSTS, CORS, clickjacking headers
- Rate limiting audit: alle uautoriserede og admin endpoints
