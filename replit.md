# Hus AI - AI-Powered Interior Design

## Overview
Hus AI is a web application that uses the Collov AI API to transform room photos. Users upload a room photo, select a room type and design style, and receive an AI-generated redesign that preserves the room structure while changing the interior style.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TailwindCSS, Shadcn/UI, Framer Motion, TanStack Query
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: Collov AI Virtual Staging API

## Architecture
- `shared/schema.ts` - Data models (designs table), room types, design styles, Zod schemas
- `server/routes.ts` - API routes: POST /api/designs (upload + Collov), GET /api/designs, GET /api/designs/:id
- `server/storage.ts` - Database CRUD operations for designs
- `server/db.ts` - PostgreSQL connection pool
- `client/src/pages/home.tsx` - Main page with 3-step flow (upload → configure → result)
- `client/src/components/before-after-slider.tsx` - Interactive before/after comparison slider
- `client/src/components/design-card.tsx` - Design history card component

## Collov API Integration
- **Send task**: POST `https://api.collov.ai/flair/enterpriseApi/vst/generateImgOnCommon` with `uploadUrl`, `roomType`, `style`
- **Poll result**: GET `https://api.collov.ai/flair/enterpriseApi/vst/getRecord?uuid=XXX`
- Authentication: `apiKey` header
- Async: Server polls Collov in background, frontend polls server for status updates

## Room Types
game room, kitchen, living room, outdoor, bedroom, studio, conference room, home office, home gym, dining room, laundry room, bathroom, spa room, kids room, open living and dining room

## Design Styles
scandinavian, luxury, industrial, coastal, transitional, farmhouse, mid-century, modern

## File Uploads
- Uploaded images stored in `uploads/` directory, served at `/uploads/` path
- Max 10MB, image/* types only

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `COLLOV_API_KEY` - Collov AI API key (secret)

## Running
- `npm run dev` starts the Express + Vite dev server on port 5000
