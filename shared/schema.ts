import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
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
  "mid-century",
] as const;

export type RoomType = (typeof roomTypes)[number];
export type DesignStyle = (typeof designStyles)[number];

export const designs = pgTable("designs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  originalImageUrl: text("original_image_url").notNull(),
  resultImageUrl: text("result_image_url"),
  roomType: text("room_type").notNull(),
  style: text("style").notNull(),
  status: text("status").notNull().default("pending"),
  collovUuid: text("collov_uuid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDesignSchema = createInsertSchema(designs).omit({
  id: true,
  createdAt: true,
});

export const createDesignSchema = z.object({
  roomType: z.enum(roomTypes),
  style: z.enum(designStyles),
});

export type InsertDesign = z.infer<typeof insertDesignSchema>;
export type Design = typeof designs.$inferSelect;
