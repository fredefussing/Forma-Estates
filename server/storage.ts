import {
  type Design, type InsertDesign, designs,
  type Quote, type InsertQuote, quotes,
  type SpecialRequest, type InsertSpecialRequest, specialRequests,
  type QuoteRequest, type InsertQuoteRequest, quoteRequests,
  type User, type InsertUser, users,
  type CreditTransaction, type InsertCreditTransaction, creditTransactions,
  type AgentDesign, type InsertAgentDesign, agentDesigns,
} from "@shared/schema";
import { db } from "./db";
import { pool } from "./db";
import { eq, desc, sql, or, ilike } from "drizzle-orm";

export interface IStorage {
  createUser(user: InsertUser): Promise<User>;
  getUserByFirebaseUid(uid: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUser(userId: number, updates: Partial<Pick<User, "isAdmin" | "creditsRemaining" | "subscriptionStatus" | "subscriptionTier" | "subscriptionExpires" | "customerCode">>): Promise<User | undefined>;
  getUserByCustomerCode(code: string): Promise<User | undefined>;
  searchUsers(query: string): Promise<User[]>;
  updateUserCredits(userId: number, creditsRemaining: number, totalCreditsUsed: number): Promise<User | undefined>;
  deductCredit(userId: number, description: string): Promise<boolean>;
  addCredits(userId: number, amount: number, description: string): Promise<boolean>;
  activateSubscription(userId: number, tier: string): Promise<User | undefined>;
  createCreditTransaction(tx: InsertCreditTransaction): Promise<CreditTransaction>;
  getCreditTransactionsByUser(userId: number): Promise<CreditTransaction[]>;

  createDesign(design: InsertDesign): Promise<Design>;
  getDesign(id: number): Promise<Design | undefined>;
  getAllDesigns(): Promise<Design[]>;
  getDesignsByUser(userId: number): Promise<Design[]>;
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

  createQuoteRequest(request: InsertQuoteRequest): Promise<QuoteRequest>;
  getQuoteRequest(id: number): Promise<QuoteRequest | undefined>;
  getAllQuoteRequests(): Promise<QuoteRequest[]>;
  updateQuoteRequest(id: number, updates: Partial<InsertQuoteRequest>): Promise<QuoteRequest | undefined>;

  createAgentDesign(design: InsertAgentDesign): Promise<AgentDesign>;
  getAgentDesign(id: number): Promise<AgentDesign | undefined>;
  getAgentDesignsByUser(userId: number): Promise<AgentDesign[]>;
  updateAgentDesign(id: number, updates: Partial<InsertAgentDesign>): Promise<AgentDesign | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createUser(user: InsertUser): Promise<User> {
    const [result] = await db.insert(users).values(user).returning();
    return result;
  }

  async getUserByFirebaseUid(uid: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.firebaseUid, uid));
    return result;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(
      sql`LOWER(${users.email}) = LOWER(${email})`
    );
    return result;
  }

  async updateUser(userId: number, updates: Partial<Pick<User, "isAdmin" | "creditsRemaining" | "subscriptionStatus" | "subscriptionTier" | "subscriptionExpires" | "customerCode">>): Promise<User | undefined> {
    const [result] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return result;
  }

  async getUserByCustomerCode(code: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.customerCode, code.toUpperCase()));
    return result;
  }

  async searchUsers(query: string): Promise<User[]> {
    const q = `%${query}%`;
    return db.select().from(users)
      .where(or(ilike(users.email, q), ilike(users.customerCode, q)))
      .orderBy(desc(users.createdAt))
      .limit(50);
  }

  async updateUserCredits(userId: number, creditsRemaining: number, totalCreditsUsed: number): Promise<User | undefined> {
    const [result] = await db.update(users)
      .set({ creditsRemaining, totalCreditsUsed })
      .where(eq(users.id, userId))
      .returning();
    return result;
  }

  async deductCredit(userId: number, description: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `UPDATE users SET credits_remaining = credits_remaining - 1, total_credits_used = total_credits_used + 1
         WHERE id = $1 AND credits_remaining > 0 RETURNING id`,
        [userId]
      );
      if (res.rowCount === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, type, description) VALUES ($1, -1, 'usage', $2)`,
        [userId, description]
      );
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async addCredits(userId: number, amount: number, description: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users SET credits_remaining = credits_remaining + $1 WHERE id = $2`,
        [amount, userId]
      );
      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, type, description) VALUES ($1, $2, 'purchase', $3)`,
        [userId, amount, description]
      );
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async activateSubscription(userId: number, tier: string): Promise<User | undefined> {
    const [result] = await db.update(users)
      .set({ subscriptionStatus: "active", subscriptionTier: tier })
      .where(eq(users.id, userId))
      .returning();
    return result;
  }

  async createCreditTransaction(tx: InsertCreditTransaction): Promise<CreditTransaction> {
    const [result] = await db.insert(creditTransactions).values(tx).returning();
    return result;
  }

  async getCreditTransactionsByUser(userId: number): Promise<CreditTransaction[]> {
    return db.select().from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt));
  }

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

  async getDesignsByUser(userId: number): Promise<Design[]> {
    return db.select().from(designs)
      .where(eq(designs.userId, userId))
      .orderBy(desc(designs.createdAt));
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

  async createQuoteRequest(request: InsertQuoteRequest): Promise<QuoteRequest> {
    const [result] = await db.insert(quoteRequests).values(request).returning();
    return result;
  }

  async getQuoteRequest(id: number): Promise<QuoteRequest | undefined> {
    const [result] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, id));
    return result;
  }

  async getAllQuoteRequests(): Promise<QuoteRequest[]> {
    return db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt));
  }

  async updateQuoteRequest(id: number, updates: Partial<InsertQuoteRequest>): Promise<QuoteRequest | undefined> {
    const [result] = await db.update(quoteRequests).set(updates).where(eq(quoteRequests.id, id)).returning();
    return result;
  }

  async createAgentDesign(design: InsertAgentDesign): Promise<AgentDesign> {
    const [result] = await db.insert(agentDesigns).values(design).returning();
    return result;
  }

  async getAgentDesign(id: number): Promise<AgentDesign | undefined> {
    const [result] = await db.select().from(agentDesigns).where(eq(agentDesigns.id, id));
    return result;
  }

  async getAgentDesignsByUser(userId: number): Promise<AgentDesign[]> {
    return db.select().from(agentDesigns)
      .where(eq(agentDesigns.userId, userId))
      .orderBy(desc(agentDesigns.createdAt));
  }

  async updateAgentDesign(id: number, updates: Partial<InsertAgentDesign>): Promise<AgentDesign | undefined> {
    const [result] = await db.update(agentDesigns).set(updates).where(eq(agentDesigns.id, id)).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
