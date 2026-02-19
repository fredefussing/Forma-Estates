import { type Design, type InsertDesign, designs } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createDesign(design: InsertDesign): Promise<Design>;
  getDesign(id: number): Promise<Design | undefined>;
  getAllDesigns(): Promise<Design[]>;
  updateDesign(id: number, updates: Partial<InsertDesign>): Promise<Design | undefined>;
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
}

export const storage = new DatabaseStorage();
