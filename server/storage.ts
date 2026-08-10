import {
  type Design, type InsertDesign, designs,
  type Quote, type InsertQuote, quotes,
  type SpecialRequest, type InsertSpecialRequest, specialRequests,
  type QuoteRequest, type InsertQuoteRequest, quoteRequests,
  type User, type InsertUser, users,
  type CreditTransaction, type InsertCreditTransaction, creditTransactions,
  type AgentDesign, type InsertAgentDesign, agentDesigns,
  type BoligCase, type InsertBoligCase, boligCases,
  type BoligCaseImage, type InsertBoligCaseImage, boligCaseImages,
  type AiTourProperty, type InsertAiTourProperty, aiTourProperties,
  type AiTourRoom, type InsertAiTourRoom, aiTourRooms,
  type GeneratedImage, type InsertGeneratedImage, generatedImages,
  type Team, type InsertTeam, teams,
  type TeamMember, type InsertTeamMember, teamMembers,
  type TeamInvite, type InsertTeamInvite, teamInvites,
  type CrmContact, type InsertCrmContact, crmContacts,
  type CrmActivity, type InsertCrmActivity, crmActivities,
  type CrmInteraction, type InsertCrmInteraction, crmInteractions,
  type CrmUserOverride, crmUserOverrides,
  type PendingPurchase, pendingPurchases,
  type ShareLink, shareLinks,
  dripEmails,
  SUBSCRIPTION_QUOTAS, FREE_TRIAL_QUOTAS,
  videoJobs,
} from "@shared/schema";
import { db } from "./db";
import { pool } from "./db";
import { eq, desc, sql, or, ilike, and } from "drizzle-orm";
import { BOLIG_STYLE_LABELS, BOLIG_ROOM_LABELS } from "@shared/boligPrompts";

// ── Monthly quota-period reset SQL ────────────────────────────────────────────
// When a quota period rolls over we must hand back ONLY the subscription's own
// monthly allowance — never re-inflate one-time package top-ups. New quota =
// tier base + whatever part of the top-up is still unused. NULL quotas
// (admins / unconfigured) are left untouched.
const QUOTA_TIER_BASE: Record<string, [number, number, number]> = {
  // column: [start, pro, business]
  quota_ai_visualizations: [10, 25, 60],
  quota_floor_plans: [2, 5, 12],
  quota_transform_videos: [2, 5, 12],
  quota_showcase_videos: [1, 3, 8],
};

function quotaPeriodResetSets(): string {
  const pairs: Array<[string, string]> = [
    ["quota_ai_visualizations", "used_ai_visualizations"],
    ["quota_floor_plans", "used_floor_plans"],
    ["quota_transform_videos", "used_transform_videos"],
    ["quota_showcase_videos", "used_showcase_videos"],
  ];
  const quotaSets = pairs.map(([q, u]) => {
    const [s, p, b] = QUOTA_TIER_BASE[q];
    const base = `(CASE subscription_tier WHEN 'start' THEN ${s} WHEN 'pro' THEN ${p} WHEN 'business' THEN ${b} ELSE 0 END)`;
    return `${q} = CASE WHEN ${q} IS NULL THEN NULL ELSE ${base} + LEAST(GREATEST(${q} - ${base}, 0), GREATEST(${q} - ${u}, 0)) END`;
  });
  const usedSets = pairs.map(([, u]) => `${u} = 0`);
  return [...quotaSets, ...usedSets].join(", ");
}

export interface IStorage {
  createUser(user: InsertUser): Promise<User>;
  getUserByFirebaseUid(uid: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(userId: number): Promise<User | undefined>;
  updateUser(userId: number, updates: Partial<Pick<User, "isAdmin" | "creditsRemaining" | "subscriptionStatus" | "subscriptionTier" | "subscriptionExpires" | "customerCode" | "displayName" | "emailVerified" | "verificationCodeHash" | "verificationCodeExpires" | "verificationAttempts">>): Promise<User | undefined>;
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
  countAgentDesignsByOriginalUrl(userId: number, originalImageUrl: string): Promise<number>;
  countGeneratedImageRefinements(userId: number, sourceImageId: number): Promise<number>;

  // Video job registry (persisted for restart-safe refunds)
  createVideoJob(data: { requestId: string; userId: number; feature: string; refundCount?: number }): Promise<void>;
  completeVideoJob(requestId: string): Promise<void>;
  failVideoJob(requestId: string): Promise<void>;
  getStuckVideoJobs(olderThanMs: number): Promise<Array<{ requestId: string; userId: number; feature: string; refundCount: number }>>;

  createBoligCase(data: InsertBoligCase): Promise<BoligCase>;
  getBoligCasesByUser(userId: number): Promise<BoligCase[]>;
  getBoligCase(id: number): Promise<BoligCase | undefined>;
  deleteBoligCase(id: number): Promise<void>;
  updateBoligCaseStatus(id: number, status: string, soldDateISO?: string | null): Promise<BoligCase>;
  addBoligCaseImage(data: InsertBoligCaseImage): Promise<BoligCaseImage>;
  getBoligCaseImages(caseId: number): Promise<BoligCaseImage[]>;
  getBoligStats(userId: number): Promise<{ todayImages: number; totalImages: number; activeCases: number; soldCases: number; totalCases: number; avgDaysOnMarket: number }>;
  getUserQuota(userId: number): Promise<{ ai: { limit: number | null; used: number }; floorPlan: { limit: number | null; used: number }; transformVideo: { limit: number | null; used: number }; showcase: { limit: number | null; used: number }; resetsAt: Date | null; isFreeTrial?: boolean }>;
  upsertPendingPurchase(p: { provider: string; externalId: string; email: string | null; kind: string; payload: unknown }): Promise<{ inserted: boolean }>;
  claimPendingPurchase(externalId: string, userId: number): Promise<PendingPurchase | null>;
  getPendingPurchasesByEmail(email: string): Promise<PendingPurchase[]>;
  checkAndIncrementQuota(userId: number, feature: "ai" | "floorPlan" | "transformVideo" | "showcase"): Promise<{ allowed: boolean; remaining: number | null; feature: string }>;
  refundQuota(userId: number, feature: "ai" | "floorPlan" | "transformVideo" | "showcase"): Promise<void>;
  setUserQuotas(userId: number, quotas: { ai?: number | null; floorPlans?: number | null; transformVideos?: number | null; showcase?: number | null; resetsAt?: Date; resetUsage?: boolean }): Promise<void>;
  resetMonthlyUsage(userId: number): Promise<void>;
  createGeneratedImage(data: InsertGeneratedImage): Promise<GeneratedImage>;
  getGeneratedImagesByCaseId(caseId: number, userId: number): Promise<GeneratedImage[]>;
  getAllGeneratedImages(userId: number, limit?: number): Promise<GeneratedImage[]>;
  deleteGeneratedImage(id: number, userId: number): Promise<void>;
  getBoligActivity(userId: number): Promise<Array<{ type: "generation" | "case"; label: string; imageUrl?: string; beforeImageUrl?: string; roomType?: string; style?: string; tier?: string; address?: string; caseId?: number | null; createdAt: Date; isDesignAgent?: boolean; promptText?: string }>>;
  getTeamActivity(teamId: number): Promise<Array<{ type: "generation" | "case"; userName: string; userEmail: string; roomType?: string; style?: string; tier?: string; address?: string; caseId?: number | null; imageUrl?: string; createdAt: Date }>>;
  getBoligMostUsed(userId: number): Promise<{ styles: Array<{ key: string; count: number }>; rooms: Array<{ key: string; count: number }>; tiers: Array<{ key: string; count: number }> }>;

  // Team
  createTeam(name: string, ownerUserId: number): Promise<Team>;
  getTeamByUserId(userId: number): Promise<{ team: Team; role: string } | null>;
  getTeamById(teamId: number): Promise<Team | undefined>;
  getTeamByCode(code: string): Promise<Team | undefined>;
  joinTeamByCode(code: string, userId: number): Promise<{ team: Team } | { error: string }>;
  getTeamMembers(teamId: number): Promise<TeamMember[]>;
  addTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  removeTeamMember(memberId: number): Promise<void>;
  updateTeamMemberRole(memberId: number, role: string): Promise<TeamMember | undefined>;

  // Share links (public before/after pages)
  createShareLink(userId: number, ref: { caseImageId?: number; generatedImageId?: number }, token: string): Promise<ShareLink>;
  getShareLinkData(token: string): Promise<{ beforeUrl: string | null; afterUrl: string; room: string; style: string; agentName: string | null; createdAt: Date } | null>;
  getBoligCaseImage(id: number): Promise<{ image: BoligCaseImage; ownerUserId: number } | null>;
  getGeneratedImage(id: number): Promise<GeneratedImage | undefined>;

  // Anonymous landing demo rate limiting
  demoRateCheck(ipHash: string, perIpLimit: number, globalLimit: number): Promise<{ allowed: boolean; reason?: "ip" | "global" }>;
  demoRateRefund(ipHash: string): Promise<void>;

  // Case liggetid
  updateBoligCaseMarketDate(id: number, marketDateISO: string): Promise<BoligCase>;

  // Onboarding drip emails
  getDripCandidates(emailKey: string, minAgeDays: number, maxAgeDays: number): Promise<Array<{ id: number; email: string; displayName: string | null }>>;
  recordDripEmail(userId: number, emailKey: string): Promise<boolean>;
  setMarketingOptOut(userId: number): Promise<void>;
  getTeamsOwnedByUser(userId: number): Promise<Team[]>;
  createTeamInvite(data: InsertTeamInvite): Promise<TeamInvite>;
  getTeamInviteByToken(token: string): Promise<TeamInvite | undefined>;
  markTeamInviteUsed(id: number): Promise<void>;
  getTeamStats(teamId: number): Promise<{ memberCount: number; visualsThisMonth: number; activeCases: number }>;
  getTeamMemberPerformance(teamId: number): Promise<Array<{ userId: number; name: string; email: string; visuals: number; activeCases: number; avgTimeMs: number | null }>>;
  getTeamActiveCases(teamId: number): Promise<Array<{ id: number; address: string; caseNo: string | null; status: string; ownerEmail: string; ownerName: string; latestImageUrl: string | null; imageCount: number }>>;
  getTeamSoldCases(teamId: number): Promise<Array<{ id: number; address: string; caseNo: string | null; soldDateISO: string | null; ownerName: string; latestImageUrl: string | null; imageCount: number }>>;
  allocateCreditsToMember(fromTeamId: number, toUserId: number, amount: number): Promise<void>;
  updateTeamCreditsUsed(teamId: number, amount: number): Promise<void>;

  // CRM
  getCrmContacts(opts: { search?: string; status?: string; plan?: string }): Promise<{ contacts: CrmContact[]; total: number }>;
  getCrmContact(id: string): Promise<{ contact: CrmContact; activities: CrmActivity[]; interactions: CrmInteraction[]; overrides: CrmUserOverride[]; stats: { totalGenerations: number; totalVideos: number; lastGeneratedAt: string | null } } | null>;
  createCrmContact(data: Omit<InsertCrmContact, "id">): Promise<CrmContact>;
  updateCrmContact(id: string, updates: Partial<CrmContact>): Promise<CrmContact | null>;
  addCrmInteraction(data: Omit<InsertCrmInteraction, "id">): Promise<CrmInteraction>;
  setCrmOverride(contactId: string, key: string, value: string): Promise<void>;
  deleteCrmOverride(contactId: string, key: string): Promise<void>;
  logCrmActivity(userId: number, type: string, description?: string): Promise<void>;

  // AI Boligfremvisning
  createAiTourProperty(data: InsertAiTourProperty): Promise<AiTourProperty>;
  getAiTourPropertiesByUser(userId: number): Promise<AiTourProperty[]>;
  getAiTourProperty(id: number, userId: number): Promise<AiTourProperty | undefined>;
  updateAiTourProperty(id: number, userId: number, updates: Partial<InsertAiTourProperty>): Promise<AiTourProperty | undefined>;
  deleteAiTourProperty(id: number, userId: number): Promise<void>;
  setAiTourRooms(propertyId: number, userId: number, rooms: Array<Omit<InsertAiTourRoom, "propertyId">>): Promise<AiTourRoom[]>;
  getAiTourRooms(propertyId: number, userId: number): Promise<AiTourRoom[]>;
  updateAiTourRoom(roomId: number, userId: number, updates: Partial<InsertAiTourRoom>): Promise<AiTourRoom | undefined>;
  resetUserData(userId: number): Promise<void>;
  deleteUserAccount(userId: number): Promise<void>;
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

  async updateUser(userId: number, updates: Partial<Pick<User, "isAdmin" | "creditsRemaining" | "subscriptionStatus" | "subscriptionTier" | "subscriptionExpires" | "customerCode" | "displayName" | "emailVerified" | "verificationCodeHash" | "verificationCodeExpires" | "verificationAttempts" | "agencyLogoUrl">>): Promise<User | undefined> {
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
      .where(or(ilike(users.email, q), ilike(users.displayName, q), ilike(users.customerCode, q)))
      .orderBy(desc(users.createdAt))
      .limit(50);
  }

  async getUserById(userId: number): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, userId));
    return result;
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

  async countAgentDesignsByOriginalUrl(userId: number, originalImageUrl: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(agentDesigns)
      .where(and(eq(agentDesigns.userId, userId), eq(agentDesigns.originalImageUrl, originalImageUrl)));
    return result[0]?.count ?? 0;
  }

  async createBoligCase(data: InsertBoligCase): Promise<BoligCase> {
    const [result] = await db.insert(boligCases).values(data).returning();
    return result;
  }

  async getBoligCasesByUser(userId: number): Promise<BoligCase[]> {
    return db.select().from(boligCases)
      .where(eq(boligCases.userId, userId))
      .orderBy(desc(boligCases.createdAt));
  }

  async getBoligCase(id: number): Promise<BoligCase | undefined> {
    const [result] = await db.select().from(boligCases).where(eq(boligCases.id, id));
    return result;
  }

  async deleteBoligCase(id: number): Promise<void> {
    await db.delete(boligCaseImages).where(eq(boligCaseImages.caseId, id));
    await db.delete(boligCases).where(eq(boligCases.id, id));
  }

  async updateBoligCaseStatus(id: number, status: string, soldDateISO?: string | null): Promise<BoligCase> {
    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if (soldDateISO !== undefined) updates.soldDateISO = soldDateISO;
    const [result] = await db.update(boligCases).set(updates).where(eq(boligCases.id, id)).returning();
    return result;
  }

  async getBoligStats(userId: number): Promise<{ todayImages: number; totalImages: number; activeCases: number; soldCases: number; totalCases: number; avgDaysOnMarket: number }> {
    const userCases = await db.select().from(boligCases).where(eq(boligCases.userId, userId));
    const allGenImgs = await db.select().from(generatedImages)
      .where(and(eq(generatedImages.userId, userId), eq(generatedImages.isRefinement, false)));
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayImages = allGenImgs.filter((img) => img.createdDate === todayStr).length;
    const totalImages = allGenImgs.length;
    const activeCases = userCases.filter((c) => c.status === "active");
    const soldCases = userCases.filter((c) => c.status === "sold").length;
    const now = Date.now();
    const avgDaysOnMarket = activeCases.length > 0
      ? Math.round(activeCases.reduce((s, c) => s + Math.max(0, Math.floor((now - new Date(c.marketDateISO).getTime()) / 86_400_000)), 0) / activeCases.length)
      : 0;
    return { todayImages, totalImages, activeCases: activeCases.length, soldCases, totalCases: userCases.length, avgDaysOnMarket };
  }

  async createGeneratedImage(data: InsertGeneratedImage): Promise<GeneratedImage> {
    const [result] = await db.insert(generatedImages).values(data).returning();
    return result;
  }

  async getGeneratedImagesByCaseId(caseId: number, userId: number): Promise<GeneratedImage[]> {
    return db.select().from(generatedImages)
      .where(and(eq(generatedImages.caseId, caseId), eq(generatedImages.userId, userId)))
      .orderBy(desc(generatedImages.createdAt));
  }

  async getAllGeneratedImages(userId: number, limit = 50): Promise<GeneratedImage[]> {
    return db.select().from(generatedImages)
      .where(eq(generatedImages.userId, userId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(limit);
  }

  async deleteGeneratedImage(id: number, userId: number): Promise<void> {
    await db.delete(generatedImages).where(
      and(eq(generatedImages.id, id), eq(generatedImages.userId, userId))
    );
  }

  async getBoligActivity(userId: number): Promise<Array<{ type: "generation" | "case"; label: string; imageUrl?: string; beforeImageUrl?: string; roomType?: string; style?: string; tier?: string; address?: string; caseId?: number | null; createdAt: Date; isDesignAgent?: boolean; promptText?: string }>> {
    const [gens, cases] = await Promise.all([
      db.select({ imageUrl: generatedImages.imageUrl, originalImageUrl: generatedImages.originalImageUrl, roomType: generatedImages.roomType, style: generatedImages.style, tier: generatedImages.budgetTier, caseId: generatedImages.caseId, createdAt: generatedImages.createdAt, isDesignAgent: generatedImages.isDesignAgent, promptText: generatedImages.promptText })
        .from(generatedImages).where(eq(generatedImages.userId, userId)).orderBy(desc(generatedImages.createdAt)).limit(8),
      db.select({ id: boligCases.id, address: boligCases.address, createdAt: boligCases.createdAt })
        .from(boligCases).where(eq(boligCases.userId, userId)).orderBy(desc(boligCases.createdAt)).limit(5),
    ]);
    const items = [
      ...gens.map(g => ({ type: "generation" as const, label: "", imageUrl: g.imageUrl, beforeImageUrl: g.originalImageUrl ?? undefined, roomType: g.roomType, style: g.style, tier: g.tier, caseId: g.caseId, createdAt: g.createdAt, isDesignAgent: g.isDesignAgent ?? false, promptText: g.promptText ?? undefined })),
      ...cases.map(c => ({ type: "case" as const, label: c.address, address: c.address, caseId: c.id, createdAt: c.createdAt })),
    ];
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8);
  }

  async getBoligMostUsed(userId: number): Promise<{ styles: Array<{ key: string; count: number }>; rooms: Array<{ key: string; count: number }>; tiers: Array<{ key: string; count: number }> }> {
    const imgs = await db.select({ style: generatedImages.style, roomType: generatedImages.roomType, tier: generatedImages.budgetTier, isDesignAgent: generatedImages.isDesignAgent })
      .from(generatedImages).where(eq(generatedImages.userId, userId));
    const standard = imgs.filter(i => !i.isDesignAgent);
    const designAgentCount = imgs.filter(i => i.isDesignAgent).length;
    const countTop = (keys: string[]) => {
      const map: Record<string, number> = {};
      keys.forEach(k => { map[k] = (map[k] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, count]) => ({ key, count }));
    };
    // Normalize style keys to Danish display labels to merge duplicates
    const normalizedStyles = standard.map(i => BOLIG_STYLE_LABELS[i.style] ?? i.style);
    if (designAgentCount > 0) normalizedStyles.push(...Array(designAgentCount).fill("AI Design Agent"));
    // Normalize room keys to Danish display labels to merge duplicates
    const normalizedRooms = standard.map(i => BOLIG_ROOM_LABELS[i.roomType] ?? i.roomType);
    return {
      styles: countTop(normalizedStyles),
      rooms: countTop(normalizedRooms),
      tiers: countTop(standard.map(i => i.tier)),
    };
  }

  async addBoligCaseImage(data: InsertBoligCaseImage): Promise<BoligCaseImage> {
    const [result] = await db.insert(boligCaseImages).values(data).returning();
    return result;
  }

  async getBoligCaseImages(caseId: number): Promise<BoligCaseImage[]> {
    return db.select().from(boligCaseImages)
      .where(eq(boligCaseImages.caseId, caseId))
      .orderBy(desc(boligCaseImages.createdAt));
  }

  // ── Share links (public before/after pages) ─────────────────────────────────
  async createShareLink(userId: number, ref: { caseImageId?: number; generatedImageId?: number }, token: string): Promise<ShareLink> {
    // Reuse an existing non-revoked link for the same image so the URL is stable
    const existing = await db.select().from(shareLinks).where(and(
      eq(shareLinks.userId, userId),
      eq(shareLinks.revoked, false),
      ref.caseImageId ? eq(shareLinks.caseImageId, ref.caseImageId) : eq(shareLinks.generatedImageId, ref.generatedImageId!),
    )).limit(1);
    if (existing.length > 0) return existing[0];
    const [row] = await db.insert(shareLinks).values({
      token,
      userId,
      caseImageId: ref.caseImageId ?? null,
      generatedImageId: ref.generatedImageId ?? null,
    }).returning();
    return row;
  }

  async getShareLinkData(token: string): Promise<{ beforeUrl: string | null; afterUrl: string; room: string; style: string; agentName: string | null; createdAt: Date } | null> {
    const [link] = await db.select().from(shareLinks)
      .where(and(eq(shareLinks.token, token), eq(shareLinks.revoked, false))).limit(1);
    if (!link) return null;
    const [owner] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, link.userId)).limit(1);
    if (link.caseImageId) {
      const [img] = await db.select().from(boligCaseImages).where(eq(boligCaseImages.id, link.caseImageId)).limit(1);
      if (!img) return null;
      return { beforeUrl: img.beforeSrc, afterUrl: img.src, room: img.room, style: img.style, agentName: owner?.displayName ?? null, createdAt: link.createdAt };
    }
    if (link.generatedImageId) {
      const [img] = await db.select().from(generatedImages).where(eq(generatedImages.id, link.generatedImageId)).limit(1);
      if (!img) return null;
      return { beforeUrl: img.originalImageUrl, afterUrl: img.imageUrl, room: img.roomType, style: img.style, agentName: owner?.displayName ?? null, createdAt: link.createdAt };
    }
    return null;
  }

  async getBoligCaseImage(id: number): Promise<{ image: BoligCaseImage; ownerUserId: number } | null> {
    const [row] = await db.select({ image: boligCaseImages, ownerUserId: boligCases.userId })
      .from(boligCaseImages)
      .innerJoin(boligCases, eq(boligCaseImages.caseId, boligCases.id))
      .where(eq(boligCaseImages.id, id)).limit(1);
    return row ?? null;
  }

  async getGeneratedImage(id: number): Promise<GeneratedImage | undefined> {
    const [row] = await db.select().from(generatedImages).where(eq(generatedImages.id, id)).limit(1);
    return row;
  }

  // ── Anonymous landing demo rate limiting (per hashed IP per day) ────────────
  async demoRateCheck(ipHash: string, perIpLimit: number, globalLimit: number): Promise<{ allowed: boolean; reason?: "ip" | "global" }> {
    // Global daily circuit breaker first (protects Collov credits)
    const { rows: [g] } = await pool.query(
      "SELECT COALESCE(SUM(count), 0)::int AS total FROM demo_generations WHERE created_date = CURRENT_DATE",
    );
    if (g.total >= globalLimit) return { allowed: false, reason: "global" };
    // Atomic per-IP upsert: increments and returns the new count
    const { rows: [r] } = await pool.query(
      `INSERT INTO demo_generations (ip_hash, created_date, count) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (ip_hash, created_date) DO UPDATE SET count = demo_generations.count + 1
       RETURNING count`,
      [ipHash],
    );
    if (r.count > perIpLimit) return { allowed: false, reason: "ip" };
    return { allowed: true };
  }

  // Refunder et demo-forsøg, hvis genereringen fejlede (så fejl ikke æder dagens prøve)
  async demoRateRefund(ipHash: string): Promise<void> {
    await pool.query(
      "UPDATE demo_generations SET count = GREATEST(count - 1, 0) WHERE ip_hash = $1 AND created_date = CURRENT_DATE",
      [ipHash],
    );
  }

  // ── Case liggetid ────────────────────────────────────────────────────────────
  async updateBoligCaseMarketDate(id: number, marketDateISO: string): Promise<BoligCase> {
    const [row] = await db.update(boligCases)
      .set({ marketDateISO, updatedAt: new Date() })
      .where(eq(boligCases.id, id)).returning();
    return row;
  }

  // ── Onboarding drip emails ───────────────────────────────────────────────────
  async getDripCandidates(emailKey: string, minAgeDays: number, maxAgeDays: number): Promise<Array<{ id: number; email: string; displayName: string | null }>> {
    // Only verified, opted-in users in the age window who have never generated
    // anything and haven't received this drip yet. The max-age bound prevents
    // blasting old accounts when the feature launches.
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name AS "displayName"
       FROM users u
       WHERE u.email_verified = true
         AND u.marketing_opt_out = false
         AND u.created_at <= now() - ($1 || ' days')::interval
         AND u.created_at >  now() - ($2 || ' days')::interval
         AND NOT EXISTS (SELECT 1 FROM generated_images g WHERE g.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM drip_emails d WHERE d.user_id = u.id AND d.email_key = $3)
       LIMIT 100`,
      [minAgeDays, maxAgeDays, emailKey],
    );
    return rows;
  }

  async recordDripEmail(userId: number, emailKey: string): Promise<boolean> {
    // Ledger row is written BEFORE sending — duplicate insert returns false
    const { rowCount } = await pool.query(
      "INSERT INTO drip_emails (user_id, email_key) VALUES ($1, $2) ON CONFLICT (user_id, email_key) DO NOTHING",
      [userId, emailKey],
    );
    return (rowCount ?? 0) > 0;
  }

  async setMarketingOptOut(userId: number): Promise<void> {
    await pool.query("UPDATE users SET marketing_opt_out = true WHERE id = $1", [userId]);
  }

  // ── Team methods ────────────────────────────────────────────────────────────
  async createTeam(name: string, ownerUserId: number): Promise<Team> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    let attempts = 0;
    while (attempts < 10) {
      code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const existing = await db.select({ id: teams.id }).from(teams).where(sql`UPPER(${teams.code}) = UPPER(${code})`);
      if (existing.length === 0) break;
      attempts++;
    }
    const [result] = await db.insert(teams).values({ name, code, ownerUserId, creditsRemaining: 0, creditsUsedThisMonth: 0 }).returning();
    return result;
  }

  async getTeamByCode(code: string): Promise<Team | undefined> {
    const [result] = await db.select().from(teams).where(sql`UPPER(${teams.code}) = UPPER(${code})`);
    return result;
  }

  async joinTeamByCode(code: string, userId: number): Promise<{ team: Team } | { error: string }> {
    const team = await this.getTeamByCode(code);
    if (!team) return { error: "Ugyldig kode. Tjek at du har skrevet den korrekt." };
    const existing = await this.getTeamByUserId(userId);
    if (existing) {
      if (existing.team.id === team.id) return { error: "Du er allerede med i dette team." };
      return { error: "Du er allerede i et andet team. Kontakt os for at skifte." };
    }
    // Enforce max 15 members (owner + members)
    const memberCount = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM team_members WHERE team_id = $1`, [team.id]
    );
    const total = parseInt(memberCount.rows[0]?.cnt ?? "0", 10) + 1; // +1 for owner
    if (total >= 15) return { error: "Dette team har nået grænsen på 15 medlemmer. Kontakt os på support@formaestates.dk for at hæve grænsen." };
    await db.insert(teamMembers).values({ teamId: team.id, userId, role: "user" });
    return { team };
  }

  async getTeamByUserId(userId: number): Promise<{ team: Team; role: string } | null> {
    // Check if user owns a team
    const [owned] = await db.select().from(teams).where(eq(teams.ownerUserId, userId));
    if (owned) return { team: owned, role: "admin" };
    // Check if user is a member
    const [membership] = await db.select({ team: teams, role: teamMembers.role })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId));
    if (membership) return { team: membership.team, role: membership.role };
    return null;
  }

  async getTeamById(teamId: number): Promise<Team | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.id, teamId));
    return result;
  }

  async getTeamMembers(teamId: number): Promise<TeamMember[]> {
    return db.select().from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(teamMembers.joinedAt);
  }

  async addTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [result] = await db.insert(teamMembers).values(data).returning();
    return result;
  }

  async getTeamsOwnedByUser(userId: number): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.ownerUserId, userId)).orderBy(teams.createdAt);
  }

  async removeTeamMember(memberId: number): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, memberId));
  }

  async updateTeamMemberRole(memberId: number, role: string): Promise<TeamMember | undefined> {
    const [result] = await db.update(teamMembers).set({ role }).where(eq(teamMembers.id, memberId)).returning();
    return result;
  }

  async createTeamInvite(data: InsertTeamInvite): Promise<TeamInvite> {
    const [result] = await db.insert(teamInvites).values(data).returning();
    return result;
  }

  async getTeamInviteByToken(token: string): Promise<TeamInvite | undefined> {
    const [result] = await db.select().from(teamInvites).where(eq(teamInvites.token, token));
    return result;
  }

  async markTeamInviteUsed(id: number): Promise<void> {
    await db.update(teamInvites).set({ usedAt: new Date() }).where(eq(teamInvites.id, id));
  }

  async getTeamStats(teamId: number): Promise<{ memberCount: number; visualsThisMonth: number; activeCases: number }> {
    const result = await pool.query<{ member_count: string; visuals_this_month: string; active_cases: string }>(`
      SELECT
        (SELECT COUNT(*) FROM team_members WHERE team_id = $1) +
        (SELECT COUNT(*) FROM teams WHERE id = $1) AS member_count,
        (SELECT (
          (SELECT COUNT(*) FROM generated_images gi
            JOIN users u ON gi.user_id = u.id
            LEFT JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = $1
            LEFT JOIN teams t ON u.id = t.owner_user_id AND t.id = $1
            WHERE (tm.team_id = $1 OR t.id = $1)
            AND gi.created_at >= DATE_TRUNC('month', NOW()))
          +
          (SELECT COUNT(*) FROM designs d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = $1
            LEFT JOIN teams t ON u.id = t.owner_user_id AND t.id = $1
            WHERE (tm.team_id = $1 OR t.id = $1)
            AND d.status = 'completed'
            AND d.created_at >= DATE_TRUNC('month', NOW()))
        )) AS visuals_this_month,
        (SELECT COUNT(*) FROM bolig_cases bc
          JOIN users u ON bc.user_id = u.id
          LEFT JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = $1
          LEFT JOIN teams t ON u.id = t.owner_user_id AND t.id = $1
          WHERE (tm.team_id = $1 OR t.id = $1)
          AND bc.status = 'active') AS active_cases
    `, [teamId]);
    const row = result.rows[0];
    return {
      memberCount: parseInt(row.member_count) || 0,
      visualsThisMonth: parseInt(row.visuals_this_month) || 0,
      activeCases: parseInt(row.active_cases) || 0,
    };
  }

  async getTeamMemberPerformance(teamId: number): Promise<Array<{ userId: number; name: string; email: string; visuals: number; activeCases: number; avgTimeMs: number | null }>> {
    const result = await pool.query<{ user_id: number; display_name: string | null; email: string; visuals: string; active_cases: string; avg_time_ms: string | null }>(`
      SELECT
        u.id AS user_id,
        u.display_name,
        u.email,
        COUNT(DISTINCT gi.id) FILTER (WHERE gi.created_at >= DATE_TRUNC('month', NOW())) AS visuals,
        COUNT(DISTINCT bc.id) FILTER (WHERE bc.status = 'active') AS active_cases,
        AVG(gi.generation_time_ms) FILTER (WHERE gi.created_at >= DATE_TRUNC('month', NOW())) AS avg_time_ms
      FROM users u
      LEFT JOIN generated_images gi ON u.id = gi.user_id
      LEFT JOIN bolig_cases bc ON u.id = bc.user_id
      WHERE u.id IN (
        SELECT owner_user_id FROM teams WHERE id = $1
        UNION
        SELECT user_id FROM team_members WHERE team_id = $1
      )
      GROUP BY u.id, u.display_name, u.email
      ORDER BY visuals DESC
    `, [teamId]);
    return result.rows.map(r => ({
      userId: r.user_id,
      name: r.display_name || r.email.split("@")[0],
      email: r.email,
      visuals: parseInt(r.visuals) || 0,
      activeCases: parseInt(r.active_cases) || 0,
      avgTimeMs: r.avg_time_ms ? parseFloat(r.avg_time_ms) : null,
    }));
  }

  async getTeamActiveCases(teamId: number): Promise<Array<{ id: number; address: string; caseNo: string | null; status: string; ownerEmail: string; ownerName: string; latestImageUrl: string | null; imageCount: number }>> {
    const result = await pool.query<{ id: number; address: string; case_no: string | null; status: string; owner_email: string; owner_name: string | null; latest_image_url: string | null; image_count: string }>(`
      SELECT
        bc.id, bc.address, bc.case_no, bc.status,
        u.email AS owner_email, u.display_name AS owner_name,
        (SELECT image_url FROM generated_images WHERE case_id = bc.id AND style != 'transform-video' ORDER BY created_at DESC LIMIT 1) AS latest_image_url,
        (SELECT COUNT(*) FROM generated_images WHERE case_id = bc.id)::int AS image_count
      FROM bolig_cases bc
      JOIN users u ON bc.user_id = u.id
      WHERE u.id IN (
        SELECT owner_user_id FROM teams WHERE id = $1
        UNION
        SELECT user_id FROM team_members WHERE team_id = $1
      )
      AND bc.status = 'active'
      ORDER BY bc.created_at DESC
      LIMIT 20
    `, [teamId]);
    return result.rows.map(r => ({
      id: r.id,
      address: r.address,
      caseNo: r.case_no,
      status: r.status,
      ownerEmail: r.owner_email,
      ownerName: r.owner_name || r.owner_email.split("@")[0],
      latestImageUrl: r.latest_image_url,
      imageCount: parseInt(r.image_count as unknown as string) || 0,
    }));
  }

  async getTeamSoldCases(teamId: number): Promise<Array<{ id: number; address: string; caseNo: string | null; soldDateISO: string | null; ownerName: string; latestImageUrl: string | null; imageCount: number }>> {
    const result = await pool.query<{ id: number; address: string; case_no: string | null; sold_date_iso: string | null; owner_email: string; owner_name: string | null; latest_image_url: string | null; image_count: string }>(`
      SELECT
        bc.id, bc.address, bc.case_no, bc.sold_date_iso,
        u.email AS owner_email, u.display_name AS owner_name,
        (SELECT image_url FROM generated_images WHERE case_id = bc.id AND style != 'transform-video' ORDER BY created_at DESC LIMIT 1) AS latest_image_url,
        (SELECT COUNT(*) FROM generated_images WHERE case_id = bc.id)::int AS image_count
      FROM bolig_cases bc
      JOIN users u ON bc.user_id = u.id
      WHERE u.id IN (
        SELECT owner_user_id FROM teams WHERE id = $1
        UNION
        SELECT user_id FROM team_members WHERE team_id = $1
      )
      AND bc.status = 'sold'
      ORDER BY bc.sold_date_iso DESC NULLS LAST, bc.created_at DESC
      LIMIT 30
    `, [teamId]);
    return result.rows.map(r => ({
      id: r.id,
      address: r.address,
      caseNo: r.case_no,
      soldDateISO: r.sold_date_iso,
      ownerName: r.owner_name || r.owner_email.split("@")[0],
      latestImageUrl: r.latest_image_url,
      imageCount: parseInt(r.image_count as unknown as string) || 0,
    }));
  }

  async getTeamActivity(teamId: number): Promise<Array<{ type: "generation" | "case"; userName: string; userEmail: string; roomType?: string; style?: string; tier?: string; address?: string; caseId?: number | null; imageUrl?: string; createdAt: Date }>> {
    const gens = await pool.query<{ user_name: string | null; user_email: string; room_type: string; style: string; tier: string; case_id: number | null; image_url: string; created_at: Date }>(`
      SELECT u.display_name AS user_name, u.email AS user_email, gi.room_type, gi.style, gi.budget_tier AS tier, gi.case_id, gi.image_url, gi.created_at
      FROM generated_images gi JOIN users u ON gi.user_id = u.id
      WHERE u.id IN (
        SELECT owner_user_id FROM teams WHERE id = $1
        UNION
        SELECT user_id FROM team_members WHERE team_id = $1
      )
      ORDER BY gi.created_at DESC LIMIT 15
    `, [teamId]);
    const cases = await pool.query<{ user_name: string | null; user_email: string; id: number; address: string; created_at: Date }>(`
      SELECT u.display_name AS user_name, u.email AS user_email, bc.id, bc.address, bc.created_at
      FROM bolig_cases bc JOIN users u ON bc.user_id = u.id
      WHERE u.id IN (
        SELECT owner_user_id FROM teams WHERE id = $1
        UNION
        SELECT user_id FROM team_members WHERE team_id = $1
      )
      ORDER BY bc.created_at DESC LIMIT 10
    `, [teamId]);
    const items = [
      ...gens.rows.map(g => ({ type: "generation" as const, userName: g.user_name || g.user_email.split("@")[0], userEmail: g.user_email, roomType: g.room_type, style: g.style, tier: g.tier, caseId: g.case_id, imageUrl: g.image_url, createdAt: new Date(g.created_at) })),
      ...cases.rows.map(c => ({ type: "case" as const, userName: c.user_name || c.user_email.split("@")[0], userEmail: c.user_email, address: c.address, caseId: c.id, createdAt: new Date(c.created_at) })),
    ];
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 15);
  }

  async allocateCreditsToMember(fromTeamId: number, toUserId: number, amount: number): Promise<void> {
    await pool.query("UPDATE teams SET credits_remaining = credits_remaining - $1 WHERE id = $2", [amount, fromTeamId]);
    await pool.query("UPDATE users SET credits_remaining = credits_remaining + $1 WHERE id = $2", [amount, toUserId]);
  }

  async updateTeamCreditsUsed(teamId: number, amount: number): Promise<void> {
    await pool.query("UPDATE teams SET credits_used_this_month = credits_used_this_month + $1 WHERE id = $2", [amount, teamId]);
  }

  // ── AI Boligfremvisning ──────────────────────────────────────────────────
  async createAiTourProperty(data: InsertAiTourProperty): Promise<AiTourProperty> {
    const [row] = await db.insert(aiTourProperties).values(data).returning();
    return row;
  }

  async getAiTourPropertiesByUser(userId: number): Promise<AiTourProperty[]> {
    return db.select().from(aiTourProperties)
      .where(eq(aiTourProperties.userId, userId))
      .orderBy(desc(aiTourProperties.createdAt));
  }

  async getAiTourProperty(id: number, userId: number): Promise<AiTourProperty | undefined> {
    const [row] = await db.select().from(aiTourProperties)
      .where(and(eq(aiTourProperties.id, id), eq(aiTourProperties.userId, userId)));
    return row;
  }

  async updateAiTourProperty(id: number, userId: number, updates: Partial<InsertAiTourProperty>): Promise<AiTourProperty | undefined> {
    const [row] = await db.update(aiTourProperties).set(updates)
      .where(and(eq(aiTourProperties.id, id), eq(aiTourProperties.userId, userId)))
      .returning();
    return row;
  }

  async deleteAiTourProperty(id: number, userId: number): Promise<void> {
    const owned = await this.getAiTourProperty(id, userId);
    if (!owned) return;
    await db.delete(aiTourRooms).where(eq(aiTourRooms.propertyId, id));
    await db.delete(aiTourProperties).where(eq(aiTourProperties.id, id));
  }

  // Reconcile the full room set for a property: rows whose id is in `keepIds`
  // are updated in place (preserving uploaded photo + generated after-image);
  // rows not in `keepIds` are deleted; rows without an id are inserted.
  async setAiTourRooms(
    propertyId: number,
    userId: number,
    rooms: Array<Omit<InsertAiTourRoom, "propertyId"> & { id?: number }>,
  ): Promise<AiTourRoom[]> {
    const owned = await this.getAiTourProperty(propertyId, userId);
    if (!owned) return [];
    const existing = await db.select().from(aiTourRooms).where(eq(aiTourRooms.propertyId, propertyId));
    const keepIds = new Set(rooms.map(r => r.id).filter((x): x is number => typeof x === "number" && x > 0));
    const toDelete = existing.filter(r => !keepIds.has(r.id));
    for (const r of toDelete) {
      await db.delete(aiTourRooms).where(eq(aiTourRooms.id, r.id));
    }
    for (const r of rooms) {
      if (typeof r.id === "number" && r.id > 0 && keepIds.has(r.id)) {
        const { id: _id, ...rest } = r as any;
        await db.update(aiTourRooms).set(rest).where(eq(aiTourRooms.id, r.id));
      } else {
        const { id: _id, ...rest } = r as any;
        await db.insert(aiTourRooms).values({ ...rest, propertyId });
      }
    }
    return db.select().from(aiTourRooms).where(eq(aiTourRooms.propertyId, propertyId)).orderBy(aiTourRooms.id);
  }

  async getAiTourRooms(propertyId: number, userId: number): Promise<AiTourRoom[]> {
    const owned = await this.getAiTourProperty(propertyId, userId);
    if (!owned) return [];
    return db.select().from(aiTourRooms).where(eq(aiTourRooms.propertyId, propertyId)).orderBy(aiTourRooms.id);
  }

  async updateAiTourRoom(roomId: number, userId: number, updates: Partial<InsertAiTourRoom>): Promise<AiTourRoom | undefined> {
    const [room] = await db.select().from(aiTourRooms).where(eq(aiTourRooms.id, roomId));
    if (!room) return undefined;
    const owned = await this.getAiTourProperty(room.propertyId, userId);
    if (!owned) return undefined;
    const [row] = await db.update(aiTourRooms).set(updates).where(eq(aiTourRooms.id, roomId)).returning();
    return row;
  }

  async resetUserData(userId: number): Promise<void> {
    // Delete all generated content but keep the account intact
    const ownedProps = await db.select({ id: aiTourProperties.id }).from(aiTourProperties).where(eq(aiTourProperties.userId, userId));
    for (const p of ownedProps) {
      await db.delete(aiTourRooms).where(eq(aiTourRooms.propertyId, p.id));
    }
    await db.delete(aiTourProperties).where(eq(aiTourProperties.userId, userId));
    const ownedCases = await db.select({ id: boligCases.id }).from(boligCases).where(eq(boligCases.userId, userId));
    for (const c of ownedCases) {
      await db.delete(boligCaseImages).where(eq(boligCaseImages.caseId, c.id));
    }
    await db.delete(boligCases).where(eq(boligCases.userId, userId));
    await db.delete(generatedImages).where(eq(generatedImages.userId, userId));
    try { await pool.query(`DELETE FROM video_jobs WHERE user_id = $1`, [userId]); } catch { /* table may not exist in all envs */ }
    // Reset all quota counters to zero
    await db.update(users)
      .set({ usedAiVisualizations: 0, usedFloorPlans: 0, usedTransformVideos: 0, usedShowcaseVideos: 0 })
      .where(eq(users.id, userId));
  }

  async deleteUserAccount(userId: number): Promise<void> {
    await pool.query(`DELETE FROM crm_activities WHERE contact_id IN (SELECT id FROM crm_contacts WHERE linked_user_id = $1)`, [userId]);
    await pool.query(`DELETE FROM crm_interactions WHERE contact_id IN (SELECT id FROM crm_contacts WHERE linked_user_id = $1)`, [userId]);
    await pool.query(`DELETE FROM crm_user_overrides WHERE contact_id IN (SELECT id FROM crm_contacts WHERE linked_user_id = $1)`, [userId]);
    await pool.query(`UPDATE crm_contacts SET linked_user_id = NULL WHERE linked_user_id = $1`, [userId]);
    await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
    const ownedTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.ownerUserId, userId));
    for (const t of ownedTeams) {
      await db.delete(teamMembers).where(eq(teamMembers.teamId, t.id));
      await db.delete(teamInvites).where(eq(teamInvites.teamId, t.id));
      await db.delete(teams).where(eq(teams.id, t.id));
    }
    const ownedProps = await db.select({ id: aiTourProperties.id }).from(aiTourProperties).where(eq(aiTourProperties.userId, userId));
    for (const p of ownedProps) {
      await db.delete(aiTourRooms).where(eq(aiTourRooms.propertyId, p.id));
    }
    await db.delete(aiTourProperties).where(eq(aiTourProperties.userId, userId));
    const ownedCases = await db.select({ id: boligCases.id }).from(boligCases).where(eq(boligCases.userId, userId));
    for (const c of ownedCases) {
      await db.delete(boligCaseImages).where(eq(boligCaseImages.caseId, c.id));
    }
    await db.delete(boligCases).where(eq(boligCases.userId, userId));
    await db.delete(generatedImages).where(eq(generatedImages.userId, userId));
    await db.delete(agentDesigns).where(eq(agentDesigns.userId, userId));
    await pool.query(`DELETE FROM special_requests WHERE design_id IN (SELECT id FROM designs WHERE user_id = $1)`, [userId]);
    await pool.query(`DELETE FROM quote_requests WHERE design_id IN (SELECT id FROM designs WHERE user_id = $1)`, [userId]);
    await pool.query(`DELETE FROM quotes WHERE design_id IN (SELECT id FROM designs WHERE user_id = $1)`, [userId]);
    await db.delete(designs).where(eq(designs.userId, userId));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  private _lastSyncTime = 0;

  async syncUsersToContacts(): Promise<void> {
    // Cache: only sync at most once every 2 minutes
    const now = Date.now();
    if (now - this._lastSyncTime < 2 * 60 * 1000) return;
    this._lastSyncTime = now;

    // Pull all users with their team name, subscription info, and last generation date
    const { rows } = await pool.query(`
      SELECT
        u.id, u.email, u.display_name, u.subscription_status, u.subscription_tier, u.created_at,
        t.name AS team_name,
        (SELECT MAX(created_at) FROM generated_images WHERE user_id = u.id) AS last_generated_at
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id
      LEFT JOIN teams t ON t.id = tm.team_id
      ORDER BY u.id
    `);
    for (const r of rows) {
      const plan = r.subscription_tier ?? (r.subscription_status === 'active' ? 'start' : 'none');
      // Churned detection: if sub is not active/trialing, check if they previously were active
      const rawStatus = r.subscription_status === 'active' ? 'active' : r.subscription_status === 'trialing' ? 'trial' : null;
      const id = `user-${r.id}`;
      if (rawStatus) {
        // Active or trial — always upsert with current status
        await pool.query(`
          INSERT INTO crm_contacts (id, email, name, company, plan, status, linked_user_id, created_at, last_active_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, crm_contacts.name),
            company = COALESCE(EXCLUDED.company, crm_contacts.company),
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            linked_user_id = EXCLUDED.linked_user_id,
            last_active_at = COALESCE(crm_contacts.last_active_at, EXCLUDED.last_active_at)
        `, [id, r.email, r.display_name || null, r.team_name || null, plan, rawStatus, r.id, r.created_at, r.last_generated_at || null]);
      } else {
        // Not currently subscribed — insert as lead, but if they were active/trial before → mark churned
        await pool.query(`
          INSERT INTO crm_contacts (id, email, name, company, plan, status, linked_user_id, created_at, last_active_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, crm_contacts.name),
            company = COALESCE(EXCLUDED.company, crm_contacts.company),
            plan = EXCLUDED.plan,
            status = CASE
              WHEN crm_contacts.status IN ('active', 'trial') THEN 'churned'
              ELSE crm_contacts.status
            END,
            linked_user_id = EXCLUDED.linked_user_id,
            last_active_at = COALESCE(crm_contacts.last_active_at, EXCLUDED.last_active_at)
        `, [id, r.email, r.display_name || null, r.team_name || null, plan, 'lead', r.id, r.created_at, r.last_generated_at || null]);
      }
    }
  }

  async getCrmContacts(opts: { search?: string; status?: string; plan?: string }): Promise<{ contacts: CrmContact[]; total: number }> {
    await this.syncUsersToContacts();
    const { rows } = await pool.query(`
      SELECT * FROM crm_contacts
      WHERE ($1::text IS NULL OR email ILIKE $1 OR name ILIKE $1 OR company ILIKE $1)
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR plan = $3)
      ORDER BY COALESCE(company,'zzz'), created_at DESC
      LIMIT 500
    `, [
      opts.search ? `%${opts.search}%` : null,
      opts.status || null,
      opts.plan || null,
    ]);
    const total = rows.length;
    const contacts = rows.map((r: any) => ({
      id: r.id, email: r.email, name: r.name, company: r.company, phone: r.phone,
      plan: r.plan, status: r.status, engagementScore: r.engagement_score, notes: r.notes,
      linkedUserId: r.linked_user_id, createdAt: r.created_at, lastActiveAt: r.last_active_at,
    }));
    return { contacts, total };
  }

  async getCrmContact(id: string): Promise<{ contact: CrmContact; activities: CrmActivity[]; interactions: CrmInteraction[]; overrides: CrmUserOverride[]; stats: { totalGenerations: number; totalVideos: number; lastGeneratedAt: string | null } } | null> {
    const { rows: cr } = await pool.query(`SELECT * FROM crm_contacts WHERE id = $1`, [id]);
    if (!cr[0]) return null;
    const r = cr[0];
    const contact: CrmContact = {
      id: r.id, email: r.email, name: r.name, company: r.company, phone: r.phone,
      plan: r.plan, status: r.status, engagementScore: r.engagement_score, notes: r.notes,
      linkedUserId: r.linked_user_id, createdAt: r.created_at, lastActiveAt: r.last_active_at,
    };
    const [actsRes, intsRes, ovsRes] = await Promise.all([
      pool.query(`SELECT * FROM crm_activities WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]),
      pool.query(`SELECT * FROM crm_interactions WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]),
      pool.query(`SELECT * FROM crm_user_overrides WHERE contact_id = $1 ORDER BY updated_at DESC`, [id]),
    ]);
    const activities = actsRes.rows.map((a: any) => ({ id: a.id, contactId: a.contact_id, type: a.type, description: a.description, metadata: a.metadata, createdAt: a.created_at }));
    const interactions = intsRes.rows.map((i: any) => ({ id: i.id, contactId: i.contact_id, type: i.type, content: i.content, createdBy: i.created_by, createdAt: i.created_at }));
    const overrides = ovsRes.rows.map((o: any) => ({ id: o.id, contactId: o.contact_id, overrideKey: o.override_key, overrideValue: o.override_value, updatedAt: o.updated_at }));

    // Real generation stats from generated_images
    let stats = { totalGenerations: 0, totalVideos: 0, lastGeneratedAt: null as string | null };
    if (contact.linkedUserId) {
      const { rows: statRows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE style != 'transform-video') AS total_gen,
          COUNT(*) FILTER (WHERE style = 'transform-video') AS total_vid,
          MAX(created_at) AS last_at
        FROM generated_images WHERE user_id = $1
      `, [contact.linkedUserId]);
      if (statRows[0]) {
        stats = {
          totalGenerations: parseInt(statRows[0].total_gen ?? "0"),
          totalVideos: parseInt(statRows[0].total_vid ?? "0"),
          lastGeneratedAt: statRows[0].last_at ? new Date(statRows[0].last_at).toISOString() : null,
        };
      }
    }
    return { contact, activities, interactions, overrides, stats };
  }

  async createCrmContact(data: Omit<InsertCrmContact, "id">): Promise<CrmContact> {
    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO crm_contacts (id, email, name, company, phone, plan, status, engagement_score, notes, linked_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [id, data.email, data.name ?? null, data.company ?? null, data.phone ?? null,
        data.plan ?? "none", data.status ?? "lead", data.engagementScore ?? 0, data.notes ?? null, data.linkedUserId ?? null]);
    const result = await this.getCrmContact(id);
    return result!.contact;
  }

  async updateCrmContact(id: string, updates: Partial<CrmContact>): Promise<CrmContact | null> {
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const map: Record<string, string> = { name: "name", company: "company", phone: "phone", plan: "plan", status: "status", engagementScore: "engagement_score", notes: "notes" };
    for (const [key, col] of Object.entries(map)) {
      if (key in updates) { fields.push(`${col} = $${i++}`); vals.push((updates as any)[key]); }
    }
    if (!fields.length) return null;
    vals.push(id);
    await pool.query(`UPDATE crm_contacts SET ${fields.join(", ")} WHERE id = $${i}`, vals);
    const result = await this.getCrmContact(id);
    return result?.contact ?? null;
  }

  async addCrmInteraction(data: Omit<InsertCrmInteraction, "id">): Promise<CrmInteraction> {
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO crm_interactions (id, contact_id, type, content, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [id, data.contactId, data.type ?? "note", data.content, data.createdBy ?? null]);
    return { id, contactId: data.contactId, type: data.type ?? "note", content: data.content, createdBy: data.createdBy ?? null, createdAt: new Date() };
  }

  async setCrmOverride(contactId: string, key: string, value: string): Promise<void> {
    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO crm_user_overrides (id, contact_id, override_key, override_value, updated_at)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (contact_id, override_key) DO UPDATE SET override_value = $4, updated_at = NOW()
    `, [id, contactId, key, value]);
  }

  async deleteCrmOverride(contactId: string, key: string): Promise<void> {
    await pool.query(`DELETE FROM crm_user_overrides WHERE contact_id = $1 AND override_key = $2`, [contactId, key]);
  }

  async logCrmActivity(userId: number, type: string, description?: string): Promise<void> {
    try {
      const { rows } = await pool.query(`SELECT id FROM crm_contacts WHERE linked_user_id = $1`, [userId]);
      if (!rows[0]) return;
      const contactId = rows[0].id;
      const activityId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO crm_activities (id, contact_id, type, description, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [activityId, contactId, type, description ?? null]
      );
      // Recalculate engagement score: 4 pts per activity in last 30 days, max 100
      const { rows: actRows } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM crm_activities WHERE contact_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
        [contactId]
      );
      const actCount = parseInt(actRows[0]?.cnt ?? "0");
      const newScore = Math.min(100, actCount * 4);
      await pool.query(
        `UPDATE crm_contacts SET last_active_at = NOW(), engagement_score = $1 WHERE id = $2`,
        [newScore, contactId]
      );
    } catch (err: any) {
      console.error('[CRM] logCrmActivity error:', err.message);
    }
  }

  async getUserQuota(userId: number) {
    const res = await pool.query(
      `SELECT u.quota_ai_visualizations, u.quota_floor_plans, u.quota_transform_videos, u.quota_showcase_videos,
              u.used_ai_visualizations, u.used_floor_plans, u.used_transform_videos, u.used_showcase_videos,
              u.quota_resets_at, u.is_admin
       FROM users u WHERE u.id = $1`,
      [userId]
    );
    const r = res.rows[0];
    if (!r) return { ai: { limit: 0, used: 0 }, floorPlan: { limit: 0, used: 0 }, transformVideo: { limit: 0, used: 0 }, showcase: { limit: 0, used: 0 }, resetsAt: null, teamPlan: null, teamName: null, memberCount: null, maxMembers: null };

    // If user has no explicit quotas set (all null) and is not admin → check team membership
    const hasOwnQuotas = r.quota_ai_visualizations !== null || r.quota_floor_plans !== null;
    let teamPlan: string | null = null;
    let teamName: string | null = null;
    let memberCount: number | null = null;
    let maxMembers: number | null = null;
    let effectiveLimits: { ai: number | null; floorPlan: number | null; transformVideo: number | null; showcase: number | null } | null = null;

    // Track owner's used counts (shared pool) — set when user is a team member
    let ownerUsedCounts: { ai: number; floorPlan: number; transformVideo: number; showcase: number } | null = null;

    if (!r.is_admin && !hasOwnQuotas) {
      const teamRes = await pool.query<{
        team_name: string; subscription_tier: string | null; owner_is_admin: boolean; member_cnt: string;
        owner_used_ai: number; owner_used_floor: number; owner_used_video: number; owner_used_showcase: number;
        owner_quota_ai: number | null; owner_quota_floor: number | null; owner_quota_video: number | null; owner_quota_showcase: number | null;
      }>(
        `SELECT t.name AS team_name, ou.subscription_tier, ou.is_admin AS owner_is_admin,
                (SELECT COUNT(*) FROM team_members WHERE team_id = t.id)::text AS member_cnt,
                ou.used_ai_visualizations AS owner_used_ai,
                ou.used_floor_plans AS owner_used_floor,
                ou.used_transform_videos AS owner_used_video,
                ou.used_showcase_videos AS owner_used_showcase,
                ou.quota_ai_visualizations AS owner_quota_ai,
                ou.quota_floor_plans AS owner_quota_floor,
                ou.quota_transform_videos AS owner_quota_video,
                ou.quota_showcase_videos AS owner_quota_showcase
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         JOIN users ou ON ou.id = t.owner_user_id
         WHERE tm.user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (teamRes.rows.length > 0) {
        const tr = teamRes.rows[0];
        teamName = tr.team_name;
        memberCount = parseInt(tr.member_cnt, 10) + 1; // +1 for owner
        maxMembers = 15;
        // Shared pool: report owner's used counts so member sees the real team consumption
        ownerUsedCounts = {
          ai: tr.owner_used_ai ?? 0,
          floorPlan: tr.owner_used_floor ?? 0,
          transformVideo: tr.owner_used_video ?? 0,
          showcase: tr.owner_used_showcase ?? 0,
        };
        if (tr.owner_is_admin) {
          teamPlan = "unlimited";
        } else {
          teamPlan = tr.subscription_tier ?? null;
          const ownerHasQuotas = tr.owner_quota_ai !== null || tr.owner_quota_floor !== null || tr.owner_quota_video !== null || tr.owner_quota_showcase !== null;
          if (ownerHasQuotas) {
            // Members share exactly what the owner bought (subscription and/or
            // custom package). A NULL column while others are set → 0.
            effectiveLimits = {
              ai: tr.owner_quota_ai ?? 0,
              floorPlan: tr.owner_quota_floor ?? 0,
              transformVideo: tr.owner_quota_video ?? 0,
              showcase: tr.owner_quota_showcase ?? 0,
            };
          } else if (teamPlan && teamPlan in SUBSCRIPTION_QUOTAS) {
            // Legacy fallback: owner has a tier but no quota columns configured
            const q = SUBSCRIPTION_QUOTAS[teamPlan as keyof typeof SUBSCRIPTION_QUOTAS];
            effectiveLimits = { ai: q.ai as number | null, floorPlan: q.floorPlans as number | null, transformVideo: q.transformVideos as number | null, showcase: q.showcase as number | null };
          }
        }
      }
    }

    // Also check if user OWNS a team (for owner's own quota widget)
    if (!r.is_admin && !hasOwnQuotas && !teamName) {
      const ownedTeam = await pool.query<{ team_name: string; member_cnt: string }>(
        `SELECT t.name AS team_name, (SELECT COUNT(*) FROM team_members WHERE team_id = t.id)::text AS member_cnt
         FROM teams t WHERE t.owner_user_id = $1 LIMIT 1`,
        [userId]
      );
      if (ownedTeam.rows.length > 0) {
        teamName = ownedTeam.rows[0].team_name;
        memberCount = parseInt(ownedTeam.rows[0].member_cnt, 10) + 1;
        maxMembers = 15;
      }
    }

    // For team members use owner's counters (shared pool); for owner/standalone use own counters
    const usedAi            = ownerUsedCounts ? ownerUsedCounts.ai            : (r.used_ai_visualizations  ?? 0);
    const usedFloor         = ownerUsedCounts ? ownerUsedCounts.floorPlan      : (r.used_floor_plans        ?? 0);
    const usedVideo         = ownerUsedCounts ? ownerUsedCounts.transformVideo  : (r.used_transform_videos   ?? 0);
    const usedShowcase      = ownerUsedCounts ? ownerUsedCounts.showcase        : (r.used_showcase_videos    ?? 0);

    // For admins → always unlimited (null), regardless of what quota columns hold.
    // (A package purchase on an admin account increments the column, but admins
    // must never be capped by it — they have unlimited access by definition.)
    // For regular users with NULL quotas (no plan purchased) → treat as 0, not unlimited.
    const nullMeansUnlimited = r.is_admin;
    const resolveLimit = (raw: number | null): number | null =>
      nullMeansUnlimited ? null : (raw !== null ? raw : 0);

    // Free trial: a standalone, non-admin user with no purchased plan and not
    // drawing from any team pool gets a small AI-visualiser allowance (før/efter)
    // while every other feature stays locked at 0.
    const isFreeTrial = !r.is_admin && !hasOwnQuotas && effectiveLimits === null && ownerUsedCounts === null && !teamName;
    const trialLimit = (feat: keyof typeof FREE_TRIAL_QUOTAS): number | null =>
      isFreeTrial ? FREE_TRIAL_QUOTAS[feat] : null;

    const resolveOwn = (raw: number | null, feat: keyof typeof FREE_TRIAL_QUOTAS): number | null => {
      const trial = trialLimit(feat);
      return trial !== null ? trial : resolveLimit(raw);
    };

    const ai            = effectiveLimits ? { limit: effectiveLimits.ai,            used: usedAi       } : { limit: resolveOwn(r.quota_ai_visualizations, "ai"),           used: usedAi       };
    const floorPlan     = effectiveLimits ? { limit: effectiveLimits.floorPlan,      used: usedFloor    } : { limit: resolveOwn(r.quota_floor_plans, "floorPlans"),          used: usedFloor    };
    const transformVideo= effectiveLimits ? { limit: effectiveLimits.transformVideo, used: usedVideo    } : { limit: resolveOwn(r.quota_transform_videos, "transformVideos"), used: usedVideo    };
    const showcase      = effectiveLimits ? { limit: effectiveLimits.showcase,       used: usedShowcase } : { limit: resolveOwn(r.quota_showcase_videos, "showcase"),        used: usedShowcase };

    return { ai, floorPlan, transformVideo, showcase, resetsAt: r.quota_resets_at, teamPlan, teamName, memberCount, maxMembers, isFreeTrial };
  }

  async checkAndIncrementQuota(userId: number, feature: "ai" | "floorPlan" | "transformVideo" | "showcase") {
    const col = feature === "ai" ? "ai_visualizations" : feature === "floorPlan" ? "floor_plans" : feature === "transformVideo" ? "transform_videos" : "showcase_videos";
    const label = feature === "ai" ? "AI Visualiseringer" : feature === "floorPlan" ? "3D Floor Plans" : feature === "transformVideo" ? "Transformering Videoer" : "Bolig Showcase";

    // Auto-reset if past reset date (for this user) — restores the tier's base
    // allowance and carries over only unused one-time top-ups.
    await pool.query(
      `UPDATE users SET ${quotaPeriodResetSets()},
       quota_resets_at = NOW() + INTERVAL '1 month'
       WHERE id=$1 AND quota_resets_at IS NOT NULL AND quota_resets_at < NOW()`,
      [userId]
    );

    const res = await pool.query(
      `SELECT is_admin, quota_${col}, used_${col} FROM users WHERE id=$1`,
      [userId]
    );
    const row = res.rows[0];
    if (!row) return { allowed: false, remaining: 0, feature: label };

    // Admin bypass — unlimited usage
    if (row.is_admin) return { allowed: true, remaining: null, feature: label };

    let limit: number | null = row[`quota_${col}`];

    // If no explicit quota is set, check team membership → shared pool from owner's subscription
    if (limit === null) {
      const teamRes = await pool.query<{ owner_id: number; subscription_tier: string | null; owner_is_admin: boolean }>(
        `SELECT ou.id AS owner_id, ou.subscription_tier, ou.is_admin AS owner_is_admin
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         JOIN users ou ON ou.id = t.owner_user_id
         WHERE tm.user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (teamRes.rows.length > 0) {
        const tr = teamRes.rows[0];
        if (tr.owner_is_admin) {
          return { allowed: true, remaining: null, feature: label };
        }
        // ── Shared pool: auto-reset owner if needed, then read the owner's
        // ACTUAL purchased quotas (subscription and/or custom package) ──
        await pool.query(
          `UPDATE users SET ${quotaPeriodResetSets()},
           quota_resets_at = NOW() + INTERVAL '1 month'
           WHERE id=$1 AND quota_resets_at IS NOT NULL AND quota_resets_at < NOW()`,
          [tr.owner_id]
        );
        const ownerQ = await pool.query(
          `SELECT quota_ai_visualizations, quota_floor_plans, quota_transform_videos, quota_showcase_videos FROM users WHERE id=$1`,
          [tr.owner_id]
        );
        const oq = ownerQ.rows[0] ?? {};
        const ownerHasQuotas = oq.quota_ai_visualizations !== null || oq.quota_floor_plans !== null || oq.quota_transform_videos !== null || oq.quota_showcase_videos !== null;

        if (ownerHasQuotas) {
          // Members share exactly what the owner bought — a NULL column while
          // others are set means that feature was never purchased → 0.
          limit = (oq[`quota_${col}`] as number | null) ?? 0;
        } else {
          // Legacy fallback: owner has a tier but no quota columns configured
          const tier = tr.subscription_tier;
          if (tier && tier in SUBSCRIPTION_QUOTAS) {
            const q = SUBSCRIPTION_QUOTAS[tier as keyof typeof SUBSCRIPTION_QUOTAS];
            const tierLimit = feature === "ai" ? q.ai : feature === "floorPlan" ? q.floorPlans : feature === "transformVideo" ? q.transformVideos : q.showcase;
            limit = tierLimit as number | null;
          } else {
            return { allowed: false, remaining: 0, feature: label };
          }
        }

        if (limit !== null) {
          // Atomic increment only if under the cap — prevents concurrent over-spend
          const atomicRes = await pool.query<{ new_used: number }>(
            `UPDATE users SET used_${col} = used_${col} + 1
             WHERE id=$1 AND used_${col} < $2
             RETURNING used_${col} AS new_used`,
            [tr.owner_id, limit]
          );
          if ((atomicRes.rowCount ?? 0) === 0) {
            return { allowed: false, remaining: 0, feature: label };
          }
          const newUsed: number = atomicRes.rows[0].new_used;
          return { allowed: true, remaining: limit - newUsed, feature: label };
        }
        // Unlimited owner (no cap) — just increment
        await pool.query(`UPDATE users SET used_${col} = used_${col} + 1 WHERE id=$1`, [tr.owner_id]);
        return { allowed: true, remaining: null, feature: label };
      }
      // Not in a team and no explicit quota set → free-trial user.
      // Grant a limited number of AI visualisations (før/efter); block everything else.
      const trialCap = feature === "ai" ? FREE_TRIAL_QUOTAS.ai : 0;
      if (trialCap > 0) {
        // Atomic increment only under the cap — prevents concurrent over-spend.
        const atomicRes = await pool.query<{ new_used: number }>(
          `UPDATE users SET used_${col} = used_${col} + 1
           WHERE id=$1 AND used_${col} < $2
           RETURNING used_${col} AS new_used`,
          [userId, trialCap]
        );
        if ((atomicRes.rowCount ?? 0) === 0) {
          return { allowed: false, remaining: 0, feature: label };
        }
        return { allowed: true, remaining: trialCap - atomicRes.rows[0].new_used, feature: label };
      }
      // No plan purchased and feature not part of the free trial → block.
      return { allowed: false, remaining: 0, feature: label };
    }

    // Per-user quota path (owner or user with explicit quota)
    const used: number = row[`used_${col}`] ?? 0;
    // limit === null here only for admins (already returned above), so this is safe
    if (limit !== null && used >= limit) {
      return { allowed: false, remaining: 0, feature: label };
    }
    await pool.query(`UPDATE users SET used_${col} = used_${col} + 1 WHERE id=$1`, [userId]);
    const remaining = limit === null ? null : limit - used - 1;
    return { allowed: true, remaining, feature: label };
  }

  // Reverse one quota consumption when a job ultimately fails. Mirrors
  // checkAndIncrementQuota's resolution: admins never consumed, team members
  // charged the owner's shared pool, everyone else charged their own counter.
  async refundQuota(userId: number, feature: "ai" | "floorPlan" | "transformVideo" | "showcase") {
    const col = feature === "ai" ? "ai_visualizations" : feature === "floorPlan" ? "floor_plans" : feature === "transformVideo" ? "transform_videos" : "showcase_videos";
    const res = await pool.query(`SELECT is_admin, quota_${col} FROM users WHERE id=$1`, [userId]);
    const row = res.rows[0];
    if (!row) return;
    if (row.is_admin) return; // admin never consumed a credit

    let targetId = userId;
    if (row[`quota_${col}`] === null) {
      // No explicit quota → the owner's shared pool may have been charged.
      const teamRes = await pool.query<{ owner_id: number; owner_is_admin: boolean }>(
        `SELECT ou.id AS owner_id, ou.is_admin AS owner_is_admin
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         JOIN users ou ON ou.id = t.owner_user_id
         WHERE tm.user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (teamRes.rows.length > 0) {
        if (teamRes.rows[0].owner_is_admin) return; // owner admin → nothing consumed
        targetId = teamRes.rows[0].owner_id;
      }
    }
    await pool.query(`UPDATE users SET used_${col} = GREATEST(used_${col} - 1, 0) WHERE id=$1`, [targetId]);
  }

  async setUserQuotas(userId: number, quotas: { ai?: number | null; floorPlans?: number | null; transformVideos?: number | null; showcase?: number | null; resetsAt?: Date; resetUsage?: boolean }) {
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if ("ai" in quotas)             { sets.push(`quota_ai_visualizations=$${i++}`);  vals.push(quotas.ai); }
    if ("floorPlans" in quotas)     { sets.push(`quota_floor_plans=$${i++}`);        vals.push(quotas.floorPlans); }
    if ("transformVideos" in quotas){ sets.push(`quota_transform_videos=$${i++}`);   vals.push(quotas.transformVideos); }
    if ("showcase" in quotas)       { sets.push(`quota_showcase_videos=$${i++}`);    vals.push(quotas.showcase); }
    if ("resetsAt" in quotas)       { sets.push(`quota_resets_at=$${i++}`);          vals.push(quotas.resetsAt); }
    // Opt-in: only when a plan is (re)activated do we start a fresh period and
    // clear usage carried over (e.g. free-trial AI visualisations already spent).
    // Must NOT fire on per-login reconfig or one-time top-ups, or spent quota
    // would be handed back for free.
    if (quotas.resetUsage) { sets.push(`used_ai_visualizations=0`, `used_floor_plans=0`, `used_transform_videos=0`, `used_showcase_videos=0`); }
    if (!sets.length) return;
    vals.push(userId);
    await pool.query(`UPDATE users SET ${sets.join(",")} WHERE id=$${i}`, vals);
  }

  async resetMonthlyUsage(userId: number) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);
    await pool.query(
      `UPDATE users SET ${quotaPeriodResetSets()}, quota_resets_at=$2 WHERE id=$1`,
      [userId, nextMonth]
    );
  }

  // ── Pending purchases (idempotency ledger + unclaimed-purchase inbox) ──────
  async upsertPendingPurchase(p: { provider: string; externalId: string; email: string | null; kind: string; payload: unknown }): Promise<{ inserted: boolean }> {
    const res = await pool.query(
      `INSERT INTO pending_purchases (provider, external_id, email, kind, payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (external_id) DO NOTHING
       RETURNING id`,
      [p.provider, p.externalId, p.email ? p.email.toLowerCase() : null, p.kind, JSON.stringify(p.payload ?? {})]
    );
    return { inserted: (res.rowCount ?? 0) > 0 };
  }

  // Atomic claim: only ONE caller ever gets the row back — this is the global
  // idempotency guarantee (a paid session can never be granted twice, not even
  // to two different accounts racing each other).
  async claimPendingPurchase(externalId: string, userId: number): Promise<PendingPurchase | null> {
    const res = await pool.query(
      `UPDATE pending_purchases
       SET status='claimed', claimed_by_user_id=$2, claimed_at=NOW()
       WHERE external_id=$1 AND status='pending'
       RETURNING id, provider, external_id AS "externalId", email, kind, payload, status,
                 claimed_by_user_id AS "claimedByUserId", created_at AS "createdAt", claimed_at AS "claimedAt"`,
      [externalId, userId]
    );
    return (res.rows[0] as PendingPurchase | undefined) ?? null;
  }

  async getPendingPurchasesByEmail(email: string): Promise<PendingPurchase[]> {
    const res = await pool.query(
      `SELECT id, provider, external_id AS "externalId", email, kind, payload, status,
              claimed_by_user_id AS "claimedByUserId", created_at AS "createdAt", claimed_at AS "claimedAt"
       FROM pending_purchases
       WHERE status='pending' AND LOWER(email)=LOWER($1)
       ORDER BY created_at ASC`,
      [email]
    );
    return res.rows as PendingPurchase[];
  }

  // ── Password reset tokens ────────────────────────────────────────────────────

  async createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    // Delete any existing unused tokens for this user first (one active token at a time)
    await pool.query(
      `DELETE FROM password_reset_tokens WHERE user_id=$1 AND used_at IS NULL`,
      [userId]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ id: number; userId: number; expiresAt: Date; usedAt: Date | null } | null> {
    const res = await pool.query(
      `SELECT id, user_id AS "userId", expires_at AS "expiresAt", used_at AS "usedAt"
       FROM password_reset_tokens
       WHERE token_hash=$1`,
      [tokenHash]
    );
    return res.rows[0] ?? null;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await pool.query(
      `UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1`,
      [id]
    );
  }

  // ── Bolig refinement counting ────────────────────────────────────────────────
  // Counts how many generated images already exist where originalImageUrl equals
  // the given source image URL — i.e. direct refinements of a given result image.
  async countGeneratedImageRefinements(userId: number, sourceImageId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(generatedImages)
      .where(and(
        eq(generatedImages.userId, userId),
        eq(generatedImages.sourceImageId, sourceImageId),
      ));
    return result[0]?.count ?? 0;
  }

  // ── Video job registry ───────────────────────────────────────────────────────
  async createVideoJob(data: { requestId: string; userId: number; feature: string; refundCount?: number }): Promise<void> {
    await db.insert(videoJobs).values({
      requestId: data.requestId,
      userId: data.userId,
      feature: data.feature,
      refundCount: data.refundCount ?? 1,
      status: "pending",
    }).onConflictDoNothing();
  }

  async completeVideoJob(requestId: string): Promise<void> {
    await db.update(videoJobs).set({ status: "completed" }).where(eq(videoJobs.requestId, requestId));
  }

  async failVideoJob(requestId: string): Promise<void> {
    await db.update(videoJobs).set({ status: "failed" }).where(eq(videoJobs.requestId, requestId));
  }

  async getStuckVideoJobs(olderThanMs: number): Promise<Array<{ requestId: string; userId: number; feature: string; refundCount: number }>> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const rows = await db.select({
      requestId: videoJobs.requestId,
      userId: videoJobs.userId,
      feature: videoJobs.feature,
      refundCount: videoJobs.refundCount,
    }).from(videoJobs)
      .where(and(eq(videoJobs.status, "pending"), sql`${videoJobs.createdAt} < ${cutoff}`));
    return rows;
  }
}

export const storage = new DatabaseStorage();
