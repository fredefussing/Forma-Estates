import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, numeric, boolean } from "drizzle-orm/pg-core";
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
  "transitional",
  "farmhouse",
  "midcentury",
] as const;

export const budgetTiers = ["budget", "standard", "luxury"] as const;
export const quoteStatuses = ["draft", "sent", "accepted", "declined"] as const;

export type RoomType = (typeof roomTypes)[number];
export type DesignStyle = (typeof designStyles)[number];
export type BudgetTier = (typeof budgetTiers)[number];
export type QuoteStatus = (typeof quoteStatuses)[number];

export const freeStyles: DesignStyle[] = ["modern", "scandinavian"];

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firebaseUid: varchar("firebase_uid", { length: 255 }).notNull().unique(),
  customerCode: varchar("customer_code", { length: 20 }).unique(),
  creditsRemaining: integer("credits_remaining").notNull().default(0),
  totalCreditsUsed: integer("total_credits_used").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).notNull().default("none"),
  subscriptionTier: varchar("subscription_tier", { length: 20 }),
  subscriptionExpires: timestamp("subscription_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
