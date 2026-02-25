# Nordic Sketch - AI-Powered Interior Design

## Overview
Nordic Sketch is a web application that uses the Collov AI API to transform room photos. Users upload a room photo, select a room type, design style, and budget tier, and receive an AI-generated redesign that preserves the room structure while changing the interior style. The app includes budget-specific style recommendations with Danish retailer examples and an admin quote builder for creating customer proposals.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TailwindCSS, Shadcn/UI, Framer Motion, TanStack Query
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: Collov AI Virtual Staging API

## Architecture
- `shared/schema.ts` - Data models (designs, quotes, specialRequests tables), room types, design styles, budget tiers, Zod schemas
- `shared/styleVocabulary.ts` - Style vocabulary: 8 styles × 3 budget tiers with prompts, descriptions, retailer examples
- `shared/budgetUtils.ts` - Budget utility functions (budgetToTier, getTierLabel, formatDKK)
- `server/routes.ts` - API routes for designs, quotes, and style info
- `server/storage.ts` - Database CRUD operations for designs, quotes, and special requests
- `server/db.ts` - PostgreSQL connection pool
- `client/src/pages/landing.tsx` - Landing page with hero, quiz teaser, features, about section
- `client/src/pages/find-style.tsx` - "Find din stil" quiz: 3-step flow (room → style → budget → recommendation with pre-selected redirect to /design)
- `client/src/pages/home.tsx` - Design tool page with 3-step flow (upload → configure with budget → result), reads URL params from quiz
- `client/src/pages/admin-quotes.tsx` - Admin quote builder page
- `client/src/components/budget-slider.tsx` - Budget slider with tier display and retailer recommendations
- `client/src/components/before-after-slider.tsx` - Interactive before/after comparison slider
- `client/src/components/design-card.tsx` - Design history card component
- `client/src/components/special-request.tsx` - Special request form (shown after AI generation for manual customization requests)
- `client/src/components/quote-request.tsx` - "Få tilbud" form (shown after AI generation for free quote requests)

## API Routes
- `POST /api/designs` - Upload image + create design (accepts budget field; computes tier, builds prompt from style vocabulary)
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
- **Send task**: POST `generateImgOnCommon` with `uploadUrl`, `roomType`, `style`, optional `prompt` (budget-enhanced)
- **Poll result**: GET `getRecord?uuid=XXX`
- Authentication: `apiKey` header
- Async: Server polls Collov in background, frontend polls server for status updates

## Room Types (15)
living room, bedroom, kitchen, bathroom, dining room, home office, kids room, studio, game room, home gym, laundry room, conference room, spa room, outdoor, open living and dining room

## Design Styles (8)
scandinavian, modern, luxury, industrial, coastal, transitional, farmhouse, badboy

## File Uploads
- Uploaded images stored in `uploads/` directory, served at `/uploads/` path
- Max 10MB, image/* types only

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `COLLOV_API_KEY` - Collov AI API key (secret)

## Style Quiz ("Find din stil")
- Interactive 3-step quiz at `/find-stil`: choose room → choose style → choose budget
- 8 quiz styles (skandinavisk, moderne, badboy, luksus, industriel, boheme, minimalistisk, klassisk) with room-specific preview images for skandinavisk and moderne
- Result page shows personalized recommendation with features and price range
- "Start mit design" button navigates to `/design` with pre-selected roomType, style, and budget via URL params
- Design page reads `?roomType=X&style=Y&budget=Z` query params to pre-fill selections

## Running
- `npm run dev` starts the Express + Vite dev server on port 5000
- Frontend pages: `/` (landing), `/find-stil` (style quiz), `/design` (design tool), `/admin/quotes` (admin quote builder)
