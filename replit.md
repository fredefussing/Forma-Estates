# Nordic Homebuild - AI-Powered Interior Design

## Overview
Nordic Homebuild is a web application that uses the Collov AI API to transform room photos. Users upload a room photo, select a room type, design style, and budget tier, and receive an AI-generated redesign that preserves the room structure while changing the interior style. The app includes budget-specific style recommendations with Danish retailer examples and an admin quote builder for creating customer proposals.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TailwindCSS, Shadcn/UI, Framer Motion, TanStack Query
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: Collov AI Virtual Staging API

## Architecture
- `shared/schema.ts` - Data models (users, creditTransactions, designs, quotes, specialRequests, quoteRequests tables), room types, design styles, budget tiers, Zod schemas
- `shared/styleVocabulary.ts` - Style vocabulary: 8 styles × 3 budget tiers with prompts, descriptions, retailer examples
- `shared/budgetUtils.ts` - Budget utility functions (budgetToTier, getTierLabel, formatDKK)
- `server/routes.ts` - API routes for auth, credits, designs, quotes, and style info
- `server/storage.ts` - Database CRUD operations for users, credits, designs, quotes, and special requests
- `server/firebase-admin.ts` - Firebase Admin SDK initialization and token verification
- `server/db.ts` - PostgreSQL connection pool
- `client/src/pages/landing.tsx` - Landing page with hero, quiz teaser, features, about section
- `client/src/pages/find-style.tsx` - "Find din stil" quiz: 3-step flow (room → style → budget → recommendation with pre-selected redirect to /design)
- `client/src/pages/home.tsx` - Design tool page with 3-step flow (upload → configure with budget → result), reads URL params from quiz
- `client/src/pages/trending.tsx` - Trending designs page showing popular style+room combinations
- `client/src/pages/admin-quotes.tsx` - Admin quote builder page
- `client/src/components/budget-slider.tsx` - Budget slider with tier display and retailer recommendations
- `client/src/components/before-after-slider.tsx` - Interactive before/after comparison slider
- `client/src/components/design-card.tsx` - Design history card component
- `client/src/components/special-request.tsx` - Special request form (shown after AI generation for manual customization requests)
- `client/src/components/quote-request.tsx` - "Få tilbud" form (shown after AI generation for free quote requests)

## API Routes
- `POST /api/auth/verify` - Verify Firebase token, get/create user with 2 free credits, return user + credits
- `GET /api/credits` - Get current credit balance (requires Firebase auth token)
- `POST /api/designs` - Upload image + create design (requires auth token; checks credits, deducts 1 on use, blocks at 0)
- `GET /api/trending` - Get trending design combinations (aggregated from completed designs)
- `GET /api/designs` - List all designs
- `GET /api/designs/:id` - Get single design
- `GET /api/designs/:id/status` - Poll design generation status
- `GET /api/style-info/:style/:tier` - Get style vocabulary for a style/tier combo
- `POST /api/quotes` - Create a quote for a design
- `GET /api/quotes` - List all quotes
- `GET /api/quotes/:id` - Get single quote
- `GET /api/designs/:id/quotes` - Get quotes for a design
- `PATCH /api/quotes/:id` - Update a quote
- `POST /api/special-requests` - Create a special request (manual customization, 500 kr)
- `GET /api/special-requests` - List all special requests
- `GET /api/special-requests/:id` - Get single special request
- `PATCH /api/special-requests/:id` - Update a special request (status, result image)

## Budget System
- **3 tiers**: budget (<15,000 DKK), standard (15,000-40,000 DKK), luxury (>40,000 DKK)
- Each style × tier combination has: English prompt for Collov, Danish description, Danish retailer examples
- Budget slider range: 5,000–100,000 DKK with step 1,000
- Tier info shown during selection and in results

## Quote System
- Admin page at `/admin/quotes` for building customer proposals
- Products with name, retailer, price, link
- Automatic 25% margin calculation
- Quote statuses: draft, sent, accepted, declined

## Special Request System
- Shown under AI-generated results for requests AI can't handle (specific wall colors, custom furniture, etc.)
- Price: 500 kr for manual customization
- Stored in `special_requests` table with designId, request text, customer email, status
- Statuses: pending, in_progress, completed, cancelled
- Admin can view and manage via API

## Collov API Integration
- **CRITICAL: Send ONLY 3 fields to Collov**: `uploadUrl`, `roomType`, `style` — NO `type` field, NO `prompt` field. This is the proven config that produces the best results. DO NOT add extra parameters.
- **Send task**: POST `generateImgOnCommon` with `uploadUrl`, `roomType`, `style` ONLY
- **Poll result**: GET `getRecord?uuid=XXX`
- Authentication: `apiKey` header
- Async: Server polls Collov in background, frontend polls server for status updates

## Room Types (15)
living room, bedroom, kitchen, bathroom, dining room, home office, kids room, studio, game room, home gym, laundry room, conference room, spa room, outdoor, open living and dining room

## Design Styles (8)
scandinavian, modern, luxury, industrial, coastal, transitional, farmhouse, midcentury

## File Uploads
- Uploaded images stored in `uploads/` directory, served at `/uploads/` path
- Max 10MB, image/* types only

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `COLLOV_API_KEY` - Collov AI API key (secret)

## Email System
- **All emails sent via Brevo** (BREVO_API_KEY1 env var)
- **Sender on ALL emails**: `kontakt@nordic-homebuild.com` (Nordic Homebuild)
- **Reply-to on ALL emails**: `kontakt@nordic-homebuild.com`
- **Admin notifications (BCC/recipient)**: `kontakt@nordic-homebuild.com`
- **No secondary email** — single contact address for everything
- Email flows: welcome email (signup), order confirmation (Shopify purchase), quote request notification, special request notification

## Style Quiz ("Find din stil")
- Interactive 3-step quiz at `/find-stil`: choose room → choose style → choose budget
- 8 quiz styles (skandinavisk, moderne, midcentury, luksus, industriel, boheme, minimalistisk, klassisk) with room-specific preview images for skandinavisk and moderne
- Result page shows personalized recommendation with features and price range
- "Start mit design" button navigates to `/design` with pre-selected roomType, style, and budget via URL params
- Design page reads `?roomType=X&style=Y&budget=Z` query params to pre-fill selections

## Freemium Style System
- **Free styles**: `scandinavian` and `modern` (defined in `shared/schema.ts` as `freeStyles`)
- **Locked styles**: `luxury`, `industrial`, `coastal`, `transitional`, `farmhouse`, `midcentury` — require active subscription
- **DB columns on `users`**: `subscriptionStatus` (none/active), `subscriptionTier` (basic/pro/unlimited), `subscriptionExpires` (timestamp)
- **Backend enforcement**: `POST /api/designs` checks style access — blocks non-free styles with 403 `requiresSubscription` if no active/unexpired subscription
- **Frontend UX**: Lock icons on locked styles, "GRATIS" badge on free styles, clicking locked style opens subscription modal with 3 Shopify packages
- **Auth hook**: `useAuth()` returns `subscriptionStatus` and `subscriptionTier` alongside existing fields
- **Mutation error handling**: 403 with subscription message auto-opens subscription modal

## Credit System
- **Database tables**: `users` (email, firebaseUid, creditsRemaining, totalCreditsUsed, isAdmin, subscriptionStatus, subscriptionTier, subscriptionExpires), `credit_transactions` (userId, amount, type, description)
- **Signup**: New users get 2 free credits via `POST /api/auth/verify` (triggered on first Firebase login)
- **Usage**: Each design generation deducts 1 credit; blocked with 403 when credits = 0
- **Admin override**: Users with `isAdmin=true` skip credit checks and deductions, see all designs
- **Purchase**: Shopify webhook adds credits to user by email lookup
- **Tracking**: All credit changes logged in `credit_transactions` table (types: signup_free, purchase, usage)
- **Frontend**: Account page shows real-time credits; design page shows credit count and disables generate button at 0; admin sees ∞ and ADMIN badge
- **Designs linked to users**: `designs.userId` references `users.id` (nullable for legacy designs)
- **Admin user**: fredefussing@gmail.com has `isAdmin=true`

## Pricing & Shopify
- Pricing page at `/pris` with 3 packages: Basic (49 kr, 10 images), Pro (99 kr, 25 images), Unlimited (199 kr, 60 images)
- Free tier: 2 images in Scandinavian or Modern style
- "Vælg" buttons link to Shopify checkout cart URLs
- Shopify webhook at `POST /api/shopify/webhook` receives order notifications
- On order: adds credits to user account + sends admin notification email via Brevo
- Package matching: by Shopify variant ID or product title fallback

## Authentication (Firebase)
- Firebase Auth with email/password sign-up and login
- Auth state managed via `AuthProvider` context wrapping the app (`client/src/hooks/use-auth.tsx`)
- `useAuth()` hook returns `{ user, loading, creditsRemaining, refreshCredits }` — used across all pages for nav state
- Firebase config: `client/src/lib/firebase.ts` — uses `VITE_FIREBASE_*` env vars
- Pages: `/login` (login), `/opret` (signup), `/min-konto` (account dashboard)
- All navigation bars show "Log ind" or "Min konto" depending on auth state

## Welcome Email
- On signup, backend sends welcome email via Brevo to new user + BCC to kontakt@nordic-homebuild.com
- Endpoint: `POST /api/auth/welcome-email` with `{ email }` body
- Sent from frontend after successful Firebase account creation

## Admin Dashboard
- Password-protected admin page at `/admin`
- Shows real-time stats: total designs, designs today/this week, quotes, special requests
- Displays popular styles and rooms with bar charts
- Lists recent designs with status, budget, tier info
- Backend endpoints: `POST /api/admin/login`, `GET /api/admin/stats?pw=`
- Admin password stored in `ADMIN_PASSWORD` environment variable

## Payment Success Flow
- When user clicks "Vælg" on pricing page or subscription modal in design tool:
  1. Baseline credits stored in `localStorage.pendingPurchase.baselineCredits`
  2. Shopify opens in a new tab (`window.open`)
  3. User is navigated to `/betalt` (payment success page)
- `/betalt` polls `GET /api/credits` every 3 seconds (max 20 attempts / ~60s)
- Success detected when `creditsRemaining > baseline` OR `subscriptionStatus === 'active'`
- On success: shows animated confirmation with credits added, auto-redirects to `/design` after 3.5s
- On timeout: shows manual "Tjek igen" button and option to go to design tool anyway

## Running
- `npm run dev` starts the Express + Vite dev server on port 5000
- Frontend pages: `/` (landing), `/find-stil` (style quiz), `/trending` (trending designs), `/pris` (pricing), `/design` (design tool), `/design/:id` (design detail with before/after slider), `/mine-designs` (user's design history), `/betalt` (payment success/polling page), `/login` (login), `/opret` (signup), `/min-konto` (account), `/admin` (admin dashboard), `/admin/quotes` (admin quote builder)
