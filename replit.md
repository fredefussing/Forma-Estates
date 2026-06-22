# Nordic Homebuild - AI-Powered Interior Design

**Important:** Always use the `pnpm` package manager for installing dependencies and running scripts in this project. Do not use `npm` or `yarn`. For example, to install all dependencies, run:
```
pnpm install
```
And to add a new package:
```
pnpm add <package-name>
```

## Overview
Nordic Homebuild is a web application that leverages AI to transform room photos into redesigned interiors. Users upload a room photo, select preferences like room type, design style, and budget, and receive an AI-generated redesign that maintains the room's structure while updating its interior aesthetic. The platform integrates budget-specific style recommendations, featuring Danish retailer examples, and includes an administrative quote builder for client proposals. The project aims to provide a unique, AI-driven interior design experience with market potential in personalized home decor.

## User Preferences
No specific user preferences were provided in the original `replit.md` file.

## System Architecture
The application is built with a React + TypeScript frontend utilizing Vite, TailwindCSS, Shadcn/UI, Framer Motion, and TanStack Query. The backend is an Express.js + TypeScript server, with PostgreSQL and Drizzle ORM for database management. The core AI functionality is powered by the Collov AI Virtual Staging API.

Key architectural components and features include:
- **Data Models**: Centralized schema definition for users, credit transactions, designs, quotes, and special requests, along with Zod schemas for validation.
- **Style Vocabulary**: Predefined vocabulary mapping 8 design styles across 3 budget tiers, including AI prompts, descriptions, and retailer examples.
- **Image Processing**:
    - **YOLO Object Detection**: Local inference using Xenova/yolos-tiny for furniture detection.
    - **Image Cropping**: Utilizes `jimp` for cropping, preparing images for CLIP processing.
    - **CLIP Inference**: Local inference via Xenova/clip-vit-base-patch32 for image embeddings.
- **Vector Search**: `pgvector` is used for cosine similarity searches against product embeddings, enabling furniture recommendations.
- **UI/UX Components**:
    - **Furniture Detector**: Interactive overlay on AI results to detect furniture, providing clickable zones with product suggestions.
    - **Before/After Slider**: For comparing original and AI-generated designs.
    - **Budget Slider**: Allows users to select a budget tier, displaying associated retailer recommendations.
    - **Design Tool Flow**: A multi-step process for uploading, configuring, and generating designs.
    - **Style Quiz**: An interactive "Find din stil" quiz to guide users to appropriate design selections.
    - **Admin Quote Builder**: A dedicated interface for administrators to create and manage customer proposals.
    - **Special Request Form**: Allows users to request manual customizations beyond AI capabilities.
- **Authentication**: Firebase Auth manages user authentication, with a custom `AuthProvider` and `useAuth()` hook for state management.
- **Freemium Model**: Implements a freemium structure with `scandinavian` and `modern` styles available for free, while other styles require an active subscription.
- **Credit System**: Users receive initial free credits, with subsequent design generations deducting credits. An admin override allows unlimited usage. Credits can be purchased via Shopify.
- **AI Design Agent**: A free-text prompt interface for AI design generation using Collov's edit API, allowing users to describe desired changes without predefined styles.
- **AI Furniture Analysis**: A system to analyze generated designs for furniture suggestions, prioritizing Google Lens for real product detection and falling back to OpenAI GPT-4o for conceptual recommendations.

## External Dependencies
- **Collov AI Virtual Staging API**: Primary AI engine for room transformations. Critical for image generation, utilizing specific `uploadUrl`, `roomType`, and `style` parameters.
- **PostgreSQL**: Relational database for storing all application data, integrated with Drizzle ORM.
- **Firebase Authentication**: For user sign-up, login, and authentication token management.
- **Brevo (formerly Sendinblue)**: Email service for all transactional and notification emails (welcome, order confirmations, quote requests, special requests, admin notifications).
- **Shopify**: E-commerce platform integrated for credit package purchases and subscription management via webhooks.
- **SerpApi Google Lens API**: Used for the primary furniture analysis to find real products.
- **OpenAI API**: Utilized as a fallback for the AI furniture analysis using GPT-4o vision.
- **@xenova/transformers**: Used for local inference of YOLO (object detection) and CLIP (image embeddings) models.
- **Jimp**: Image processing library used for server-side image cropping.