import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, numeric, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roomTypes = [
  "living room",
  "bedroom",
  "kitchen",
  "bathroom",
  "dining room",
  "home office",
  "kids room",
  "studio",
  "game room",
  "home gym",
  "laundry room",
  "conference room",
  "spa room",
  "outdoor",
  "open living and dining room",
] as const;

export const designStyles = [
  "scandinavian",
  "modern",
  "luxury",
  "industrial",
  "coastal",
  "bohemian",
  "japandi",
  "minimalist",
  "farmhouse",
] as const;

export const budgetTiers = ["budget", "standard", "luxury"] as const;
export const quoteStatuses = ["draft", "sent", "accepted", "declined"] as const;

export type RoomType = (typeof roomTypes)[number];
export type DesignStyle = (typeof designStyles)[number];
export type BudgetTier = (typeof budgetTiers)[number];
export type QuoteStatus = (typeof quoteStatuses)[number];

export const freeStyles: DesignStyle[] = [];

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firebaseUid: varchar("firebase_uid", { length: 255 }).notNull().unique(),
  displayName: text("display_name"),
  customerCode: varchar("customer_code", { length: 20 }).unique(),
  creditsRemaining: integer("credits_remaining").notNull().default(0),
  totalCreditsUsed: integer("total_credits_used").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).notNull().default("none"),
  subscriptionTier: varchar("subscription_tier", { length: 20 }),
  subscriptionExpires: timestamp("subscription_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Per-feature monthly quotas (null = unlimited for admin)
  quotaAiVisualizations: integer("quota_ai_visualizations"),
  quotaFloorPlans: integer("quota_floor_plans"),
  quotaTransformVideos: integer("quota_transform_videos"),
  quotaShowcaseVideos: integer("quota_showcase_videos"),
  usedAiVisualizations: integer("used_ai_visualizations").notNull().default(0),
  usedFloorPlans: integer("used_floor_plans").notNull().default(0),
  usedTransformVideos: integer("used_transform_videos").notNull().default(0),
  usedShowcaseVideos: integer("used_showcase_videos").notNull().default(0),
  quotaResetsAt: timestamp("quota_resets_at"),
  // Email verification: new accounts must confirm their email with a 6-digit
  // code before they can use the app. Existing users are grandfathered (true).
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationCodeHash: varchar("verification_code_hash", { length: 128 }),
  verificationCodeExpires: timestamp("verification_code_expires"),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  // GDPR: users can opt out of onboarding/marketing emails (transactional
  // emails like verification codes and receipts are unaffected).
  marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
  // Branding: user-uploaded agency logo composited onto every generated image.
  agencyLogoUrl: text("agency_logo_url"),
});

// Monthly quotas per subscription tier
export const SUBSCRIPTION_QUOTAS = {
  start:    { ai: 10, floorPlans: 2,  transformVideos: 2,  showcase: 1 },
  pro:      { ai: 25, floorPlans: 5,  transformVideos: 5,  showcase: 3 },
  business: { ai: 60, floorPlans: 12, transformVideos: 12, showcase: 8 },
  unlimited: { ai: null as number | null, floorPlans: null as number | null, transformVideos: null as number | null, showcase: null as number | null },
} as const;

// Free trial for brand-new users without a plan: a taste of the AI visualiser
// (før/efter) only. All other features stay locked until they upgrade.
// This is a *lifetime* allowance — free users have no quota_resets_at so their
// used_ai_visualizations counter never resets.
export const FREE_TRIAL_QUOTAS = { ai: 2, floorPlans: 0, transformVideos: 0, showcase: 0 } as const;

export type QuotaFeature = "ai" | "floorPlan" | "transformVideo" | "showcase";

export const creditTransactions = pgTable("credit_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const designs = pgTable("designs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  originalImageUrl: text("original_image_url").notNull(),
  resultImageUrl: text("result_image_url"),
  versions: text("versions").array(),
  roomType: text("room_type").notNull(),
  style: text("style").notNull(),
  status: text("status").notNull().default("pending"),
  failReason: text("fail_reason"),
  collovUuid: text("collov_uuid"),
  budget: integer("budget"),
  tier: text("tier"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quotes = pgTable("quotes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  designId: integer("design_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  products: jsonb("products").notNull().default([]),
  totalPrice: numeric("total_price").notNull().default("0"),
  margin: numeric("margin").notNull().default("0"),
  finalPrice: numeric("final_price").notNull().default("0"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const specialRequestStatuses = ["pending", "in_progress", "completed", "cancelled"] as const;
export type SpecialRequestStatus = (typeof specialRequestStatuses)[number];

export const specialRequests = pgTable("special_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  designId: integer("design_id").notNull(),
  originalImageUrl: text("original_image_url").notNull(),
  resultImageUrl: text("result_image_url"),
  request: text("request").notNull(),
  customerEmail: text("customer_email"),
  price: integer("price").notNull().default(500),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quoteRequests = pgTable("quote_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  designId: integer("design_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  notes: text("notes"),
  generatedImageUrl: text("generated_image_url").notNull(),
  roomType: text("room_type").notNull(),
  style: text("style").notNull(),
  budget: integer("budget"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true as never,
  createdAt: true as never,
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true as never,
  createdAt: true as never,
});

export const insertDesignSchema = createInsertSchema(designs).omit({
  id: true as never,
  createdAt: true as never,
});

export const createDesignSchema = z.object({
  roomType: z.enum(roomTypes),
  style: z.enum(designStyles),
  budget: z.number().int().min(0).max(1000000).optional(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true as never,
  createdAt: true as never,
});

export const createQuoteSchema = z.object({
  designId: z.number().int(),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  products: z.array(z.object({
    name: z.string(),
    retailer: z.string(),
    price: z.number(),
    link: z.string().optional(),
  })).default([]),
  totalPrice: z.string().optional(),
  margin: z.string().optional(),
  finalPrice: z.string().optional(),
  status: z.enum(quoteStatuses).default("draft"),
});

export const insertSpecialRequestSchema = createInsertSchema(specialRequests).omit({
  id: true as never,
  createdAt: true as never,
});

export const createSpecialRequestSchema = z.object({
  designId: z.number().int(),
  originalImageUrl: z.string().min(1),
  request: z.string().min(1).max(500),
  customerEmail: z.string().email().optional(),
  price: z.number().int().default(500),
});

export const agentDesigns = pgTable("agent_designs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  originalImageUrl: text("original_image_url").notNull(),
  agentPrompt: text("agent_prompt").notNull(),
  resultImageUrl: text("result_image_url"),
  status: text("status").notNull().default("pending"),
  collovUuid: text("collov_uuid"),
  failReason: text("fail_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentDesignSchema = createInsertSchema(agentDesigns).omit({
  id: true as never,
  createdAt: true as never,
});

export type InsertAgentDesign = z.infer<typeof insertAgentDesignSchema>;
export type AgentDesign = typeof agentDesigns.$inferSelect;

export const insertQuoteRequestSchema = createInsertSchema(quoteRequests).omit({
  id: true as never,
  createdAt: true as never,
});

export const createQuoteRequestSchema = z.object({
  designId: z.number().int(),
  customerEmail: z.string().email(),
  notes: z.string().max(100).optional(),
  generatedImageUrl: z.string().min(1),
  roomType: z.string().min(1),
  style: z.string().min(1),
  budget: z.number().int().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertDesign = z.infer<typeof insertDesignSchema>;
export type Design = typeof designs.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;
export type InsertSpecialRequest = z.infer<typeof insertSpecialRequestSchema>;
export type SpecialRequest = typeof specialRequests.$inferSelect;
export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;
export type QuoteRequest = typeof quoteRequests.$inferSelect;

// ── AI BoligPotentiale: Cases ─────────────────────────────────────────────────
export const boligCases = pgTable("bolig_cases", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  address: text("address").notNull(),
  caseNo: text("case_no"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  marketDateISO: text("market_date_iso").notNull(),
  soldDateISO: text("sold_date_iso"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const boligCaseImages = pgTable("bolig_case_images", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  caseId: integer("case_id").references(() => boligCases.id).notNull(),
  style: text("style").notNull(),
  room: text("room").notNull(),
  tier: text("tier").default("tier2"),
  promptUsed: text("prompt_used"),
  src: text("src").notNull(),
  beforeSrc: text("before_src"),
  daysAfterMarket: integer("days_after_market").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Universal Generated Images ─────────────────────────────────────────────────
export const generatedImages = pgTable("generated_images", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  caseId: integer("case_id").references(() => boligCases.id, { onDelete: "set null" }),
  isQuickGeneration: boolean("is_quick_generation").default(false),
  isDesignAgent: boolean("is_design_agent").default(false),
  quickSessionId: text("quick_session_id"),
  imageUrl: text("image_url").notNull(),
  originalImageUrl: text("original_image_url"),
  roomType: text("room_type").notNull(),
  style: text("style").notNull(),
  budgetTier: text("budget_tier").notNull().default("tier2"),
  promptText: text("prompt_text"),
  isRefinement: boolean("is_refinement").notNull().default(false),
  sourceImageId: integer("source_image_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  generationTimeMs: integer("generation_time_ms"),
  createdDate: date("created_date").defaultNow(),
});

export const insertGeneratedImageSchema = createInsertSchema(generatedImages).omit({ id: true as never, createdAt: true as never });
export type InsertGeneratedImage = z.infer<typeof insertGeneratedImageSchema>;
export type GeneratedImage = typeof generatedImages.$inferSelect;

export const insertBoligCaseSchema = createInsertSchema(boligCases).omit({ id: true as never, createdAt: true as never });
export const insertBoligCaseImageSchema = createInsertSchema(boligCaseImages).omit({ id: true as never, createdAt: true as never });
export type InsertBoligCase = z.infer<typeof insertBoligCaseSchema>;
export type BoligCase = typeof boligCases.$inferSelect;
export type InsertBoligCaseImage = z.infer<typeof insertBoligCaseImageSchema>;
export type BoligCaseImage = typeof boligCaseImages.$inferSelect;

// ── Public share links (før/efter pages, no login) ──────────────────────────
export const shareLinks = pgTable("share_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  token: varchar("token", { length: 32 }).notNull().unique(),
  userId: integer("user_id").references(() => users.id).notNull(),
  caseImageId: integer("case_image_id").references(() => boligCaseImages.id),
  generatedImageId: integer("generated_image_id").references(() => generatedImages.id),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ShareLink = typeof shareLinks.$inferSelect;

// ── Anonymous landing demo rate limiting (per hashed IP per day) ─────────────
export const demoGenerations = pgTable("demo_generations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  createdDate: date("created_date").defaultNow().notNull(),
  count: integer("count").notNull().default(1),
});

// ── Onboarding drip email ledger (duplicate protection across restarts) ─────
export const dripEmails = pgTable("drip_emails", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  emailKey: varchar("email_key", { length: 30 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// ── AI Boligfremvisning (property tours) ─────────────────────────────────────
export const aiTourProperties = pgTable("ai_tour_properties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  floorplanUrl: text("floorplan_url").notNull(),
  threedPlanUrl: text("threed_plan_url"),
  style: text("style"),
  tier: text("tier").default("standard"),
  status: text("status").notNull().default("uploading"),
  // GPT-4o-mini vision analysis of the uploaded floor plan. Used to feed
  // architectural facts (windows/doors/exterior walls) into the after-image
  // and panorama prompts WITHOUT modifying the prompt library itself.
  floorplanAnalysis: jsonb("floorplan_analysis"),
  // Guidet AI-rundvisning: URL til den samlede sammenklippede film + status
  // ("generating" | "done" | "error"). Per-rum klip ligger på aiTourRooms.videoUrl.
  tourVideoUrl: text("tour_video_url"),
  tourStatus: text("tour_status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiTourRooms = pgTable("ai_tour_rooms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").references(() => aiTourProperties.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  posX: numeric("pos_x").notNull().default("0"),
  posY: numeric("pos_y").notNull().default("0"),
  width: numeric("width").notNull().default("10"),
  height: numeric("height").notNull().default("10"),
  color: text("color").notNull().default("#C8956C"),
  included: boolean("included").notNull().default(false),
  style: text("style"),
  // Strategy B (2-angle uploads). roomPhotoUrl / afterImageUrl remain the
  // primary "angle 1" fields for back-compat with all existing sags. The
  // *2 fields are populated only when the user uploads a second angle —
  // when both exist we stitch a true 360° panorama from both.
  roomPhotoUrl: text("room_photo_url"),
  roomPhotoUrl2: text("room_photo_url_2"),
  afterImageUrl: text("after_image_url"),
  afterImageUrl2: text("after_image_url_2"),
  panoramaUrl: text("panorama_url"),
  // Cached synthetic anchor angles generated by Collov "rotate N°" prompts.
  // Used by the AI boligfremvisning panorama endpoint to give nano-banana-2
  // multiple stil-konsistente reference views even when the user only
  // uploaded 1 vinkel. Persisted so panorama regenerations don't recompute.
  syntheticAngleUrls: text("synthetic_angle_urls").array(),
  // Anchor metadata for the most recent panorama (real vs. synthetic count)
  // — shown to the user via a "Premium 360°" quality badge.
  panoramaAnchors: jsonb("panorama_anchors"),
  videoUrl: text("video_url"),
  // Per-room slice of property.floorplanAnalysis (windows/doors/exteriorWalls
  // for THIS room). Populated by /analyze-floorplan; appended as architectural
  // facts to the after-image + panorama prompts.
  analysisData: jsonb("analysis_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiTourPropertySchema = createInsertSchema(aiTourProperties).omit({ id: true as never, createdAt: true as never });
export const insertAiTourRoomSchema = createInsertSchema(aiTourRooms).omit({ id: true as never, createdAt: true as never });
export type InsertAiTourProperty = z.infer<typeof insertAiTourPropertySchema>;
export type AiTourProperty = typeof aiTourProperties.$inferSelect;
export type InsertAiTourRoom = z.infer<typeof insertAiTourRoomSchema>;
export type AiTourRoom = typeof aiTourRooms.$inferSelect;

// ── Subscriptions (Stripe-ready scaffold) ────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  planType: text("plan_type").notNull(),
  status: text("status").notNull().default("trialing"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  creditsPerMonth: integer("credits_per_month").notNull().default(0),
  creditsUsedThisMonth: integer("credits_used_this_month").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true as never, createdAt: true as never });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ── Team ──────────────────────────────────────────────────────────────────────
export const teams = pgTable("teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  ownerUserId: integer("owner_user_id").references(() => users.id).notNull(),
  creditsRemaining: integer("credits_remaining").notNull().default(0),
  creditsUsedThisMonth: integer("credits_used_this_month").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").references(() => teams.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("user"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const teamInvites = pgTable("team_invites", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").references(() => teams.id).notNull(),
  email: text("email"),
  token: text("token").notNull().unique(),
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true as never, createdAt: true as never });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true as never, joinedAt: true as never });
export const insertTeamInviteSchema = createInsertSchema(teamInvites).omit({ id: true as never, createdAt: true as never });

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamInvite = typeof teamInvites.$inferSelect;
export type InsertTeamInvite = z.infer<typeof insertTeamInviteSchema>;

// ── Pending purchases (paid but not yet linked to a user account) ────────────
// Every fulfilled payment claims a row here first (atomic) — this is the
// idempotency ledger. A purchase whose email has no account yet stays
// 'pending' and is auto-claimed on first login/signup with that email.
export const pendingPurchases = pgTable("pending_purchases", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  provider: text("provider").notNull(), // 'stripe' | 'shopify'
  externalId: text("external_id").notNull().unique(), // 'stripe:<sessionId>' | 'shopify:<orderId>'
  email: text("email"),
  kind: text("kind").notNull(), // 'subscription' | 'package' | 'shopify_credits'
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("pending"), // 'pending' | 'claimed'
  claimedByUserId: integer("claimed_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  claimedAt: timestamp("claimed_at"),
});

export type PendingPurchase = typeof pendingPurchases.$inferSelect;

// ── CRM ───────────────────────────────────────────────────────────────────────
export const crmContacts = pgTable("crm_contacts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  company: text("company"),
  phone: text("phone"),
  plan: text("plan").notNull().default("none"),
  status: text("status").notNull().default("lead"),
  engagementScore: integer("engagement_score").notNull().default(0),
  notes: text("notes"),
  linkedUserId: integer("linked_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at"),
});

export const crmActivities = pgTable("crm_activities", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => crmContacts.id).notNull(),
  type: text("type").notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crmInteractions = pgTable("crm_interactions", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => crmContacts.id).notNull(),
  type: text("type").notNull().default("note"),
  content: text("content").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crmUserOverrides = pgTable("crm_user_overrides", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => crmContacts.id).notNull(),
  overrideKey: text("override_key").notNull(),
  overrideValue: text("override_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrmContactSchema = createInsertSchema(crmContacts).omit({ createdAt: true as never });
export const insertCrmActivitySchema = createInsertSchema(crmActivities).omit({ createdAt: true as never });
export const insertCrmInteractionSchema = createInsertSchema(crmInteractions).omit({ createdAt: true as never });
export const insertCrmUserOverrideSchema = createInsertSchema(crmUserOverrides).omit({ updatedAt: true as never });

export type CrmContact = typeof crmContacts.$inferSelect;
export type InsertCrmContact = z.infer<typeof insertCrmContactSchema>;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type InsertCrmActivity = z.infer<typeof insertCrmActivitySchema>;
export type CrmInteraction = typeof crmInteractions.$inferSelect;
export type InsertCrmInteraction = z.infer<typeof insertCrmInteractionSchema>;
export type CrmUserOverride = typeof crmUserOverrides.$inferSelect;
export type InsertCrmUserOverride = z.infer<typeof insertCrmUserOverrideSchema>;

// ── Leads (admin-only sales pipeline) ────────────────────────────────────────
export const leads = pgTable("leads", {
  id:               integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name:             text("name").notNull(),
  category:         text("category").notNull().default("ejendomsmaegler"), // ejendomsmaegler | arkitekt | toemrerfirma | byggefirma | andet
  instagramHandle:  text("instagram_handle"),
  email:            text("email"),
  phone:            text("phone"),
  ownerPhone:       text("owner_phone"),
  officePhone:      text("office_phone"),
  dealAmount:       integer("deal_amount"),
  status:           text("status").notNull().default("new"), // new | contacted | responded | no | won
  notes:            text("notes"),
  firstContactAt:   timestamp("first_contact_at"),
  followUpAt:       timestamp("follow_up_at"),
  followUp1At:      timestamp("follow_up_1_at"),
  followUp1Done:    boolean("follow_up_1_done").notNull().default(false),
  followUp2At:      timestamp("follow_up_2_at"),
  followUp2Done:    boolean("follow_up_2_done").notNull().default(false),
  lastContactedAt:  timestamp("last_contacted_at"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});
export const insertLeadSchema = createInsertSchema(leads).omit({ createdAt: true as never, updatedAt: true as never });
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

// ── Password reset tokens ─────────────────────────────────────────────────────
// Server-generated tokens for the custom Brevo-based password reset flow.
// The raw token is emailed to the user; only the SHA-256 hash is stored.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// ── Video job registry (persisted so refunds survive server restarts) ─────────
// Each in-flight video generation writes a row here. On boot, rows still
// 'pending' are failed and their quota is refunded.
export const videoJobs = pgTable("video_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  requestId: text("request_id").notNull().unique(),
  userId: integer("user_id").references(() => users.id).notNull(),
  // 'transformVideo' | 'showcase' | 'walkthrough' | 'transformFilm'
  feature: text("feature").notNull(),
  // For transformFilm: number of clips (each costs 1 quota). Otherwise 1.
  refundCount: integer("refund_count").notNull().default(1),
  status: text("status").notNull().default("pending"), // 'pending' | 'completed' | 'failed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VideoJob = typeof videoJobs.$inferSelect;

// ── Rendy Voice-Over Projects ──────────────────────────────────────────────────
// Persists each user-initiated voice-over project for a completed Rendy video.
// Preparation (noise-reduction, STT) and export (mix + subtitle burn) run async.
export const rendyVoiceProjects = pgTable("rendy_voice_projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id).notNull(),
  listingId: text("listing_id").notNull(),
  sourceVideoId: text("source_video_id").notNull(),
  // processing | review | exporting | ready | failed
  status: text("status").notNull().default("processing"),
  language: text("language").notNull().default("da"),
  // Caption segments (JSONB: {id,start,end,text,hidden?}[])
  segments: jsonb("segments"),
  subtitlesEnabled: boolean("subtitles_enabled").notNull().default(true),
  // Stable /uploads/<key> URLs
  sourceUrl: text("source_url"),        // localized source video
  audioUrl: text("audio_url"),          // cleaned/polished voice-over
  outputUrl: text("output_url"),        // final mixed output
  // Durability anchors — persisted immediately after the raw upload lands in R2
  // so server restarts can re-derive everything without asking the client again.
  sourceInputUrl: text("source_input_url"),  // validated original source URL (may be /uploads/ or HTTPS CDN)
  rawAudioKey: text("raw_audio_key"),        // R2 key for the raw uploaded audio file
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),    // set when status transitions to ready
  // Distributed lease — prevents duplicate work across Render instances / restarts.
  // A worker atomically claims a row by writing a unique token + 5-min expiry.
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at"),
});

export type RendyVoiceProject = typeof rendyVoiceProjects.$inferSelect;
export type InsertRendyVoiceProject = typeof rendyVoiceProjects.$inferInsert;
