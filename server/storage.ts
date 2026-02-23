import { type Design, type InsertDesign, designs, type Quote, type InsertQuote, quotes, type SpecialRequest, type InsertSpecialRequest, specialRequests } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createDesign(design: InsertDesign): Promise<Design>;
  getDesign(id: number): Promise<Design | undefined>;
  getAllDesigns(): Promise<Design[]>;
  updateDesign(id: number, updates: Partial<InsertDesign>): Promise<Design | undefined>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  getQuote(id: number): Promise<Quote | undefined>;
  getQuotesByDesign(designId: number): Promise<Quote[]>;
  updateQuote(id: number, updates: Partial<InsertQuote>): Promise<Quote | undefined>;
  getAllQuotes(): Promise<Quote[]>;
  createSpecialRequest(request: InsertSpecialRequest): Promise<SpecialRequest>;
  getSpecialRequest(id: number): Promise<SpecialRequest | undefined>;
  getAllSpecialRequests(): Promise<SpecialRequest[]>;
  updateSpecialRequest(id: number, updates: Partial<InsertSpecialRequest>): Promise<SpecialRequest | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createDesign(design: InsertDesign): Promise<Design> {
    const [result] = await db.insert(designs).values(design).returning();
    return result;
  }

  async getDesign(id: number): Promise<Design | undefined> {
    const [result] = await db.select().from(designs).where(eq(designs.id, id));
    return result;
  }

  async getAllDesigns(): Promise<Design[]> {
    return db.select().from(designs).orderBy(desc(designs.createdAt));
  }

  async updateDesign(id: number, updates: Partial<InsertDesign>): Promise<Design | undefined> {
    const [result] = await db.update(designs).set(updates).where(eq(designs.id, id)).returning();
    return result;
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [result] = await db.insert(quotes).values(quote).returning();
    return result;
  }

  async getQuote(id: number): Promise<Quote | undefined> {
    const [result] = await db.select().from(quotes).where(eq(quotes.id, id));
    return result;
  }

  async getQuotesByDesign(designId: number): Promise<Quote[]> {
    return db.select().from(quotes).where(eq(quotes.designId, designId)).orderBy(desc(quotes.createdAt));
  }

  async updateQuote(id: number, updates: Partial<InsertQuote>): Promise<Quote | undefined> {
    const [result] = await db.update(quotes).set(updates).where(eq(quotes.id, id)).returning();
    return result;
  }

  async getAllQuotes(): Promise<Quote[]> {
    return db.select().from(quotes).orderBy(desc(quotes.createdAt));
  }

  async createSpecialRequest(request: InsertSpecialRequest): Promise<SpecialRequest> {
    const [result] = await db.insert(specialRequests).values(request).returning();
    return result;
  }

  async getSpecialRequest(id: number): Promise<SpecialRequest | undefined> {
    const [result] = await db.select().from(specialRequests).where(eq(specialRequests.id, id));
    return result;
  }

  async getAllSpecialRequests(): Promise<SpecialRequest[]> {
    return db.select().from(specialRequests).orderBy(desc(specialRequests.createdAt));
  }

  async updateSpecialRequest(id: number, updates: Partial<InsertSpecialRequest>): Promise<SpecialRequest | undefined> {
    const [result] = await db.update(specialRequests).set(updates).where(eq(specialRequests.id, id)).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
