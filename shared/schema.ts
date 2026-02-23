import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
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
  "badboy",
] as const;

export const budgetTiers = ["budget", "standard", "luxury"] as const;
export const quoteStatuses = ["draft", "sent", "accepted", "declined"] as const;

export type RoomType = (typeof roomTypes)[number];
export type DesignStyle = (typeof designStyles)[number];
export type BudgetTier = (typeof budgetTiers)[number];
export type QuoteStatus = (typeof quoteStatuses)[number];

export const designs = pgTable("designs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  originalImageUrl: text("original_image_url").notNull(),
  resultImageUrl: text("result_image_url"),
  roomType: text("room_type").notNull(),
  style: text("style").notNull(),
  status: text("status").notNull().default("pending"),
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

export const insertDesignSchema = createInsertSchema(designs).omit({
  id: true as never,
  createdAt: true as never,
});

export const createDesignSchema = z.object({
  roomType: z.enum(roomTypes),
  style: z.enum(designStyles),
  budget: z.number().int().min(5000).max(100000).optional(),
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

export type InsertDesign = z.infer<typeof insertDesignSchema>;
export type Design = typeof designs.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;
