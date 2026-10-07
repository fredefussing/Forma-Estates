import crypto from "node:crypto";

export type ImageJobResult = { status: number; body: Record<string, any> };
type Job = { userId: number; state: "pending" | "completed"; result?: ImageJobResult; completedAt?: number };

/** Short HTTP requests; provider work is started exactly once, never by polling. */
export class ImageGenerationJobs {
  private jobs = new Map<string, Job>();
  constructor(private persistence: {
    register(id: string, userId: number, refundCount: number): Promise<void>;
    settle(id: string, success: boolean): Promise<void>;
  }) {}

  async start(userId: number, refundCount: number, work: (id: string) => Promise<ImageJobResult>) {
    for (const [id, job] of Array.from(this.jobs.entries())) {
      if (job.completedAt && Date.now() - job.completedAt > 30 * 60_000) this.jobs.delete(id);
    }
    if (Array.from(this.jobs.values()).filter(j => j.state === "pending").length >= 24 ||
        Array.from(this.jobs.values()).filter(j => j.userId === userId && j.state === "pending").length >= 2) {
      throw new Error("Der er allerede billedgenereringer i gang. Vent på resultatet, før du starter en ny.");
    }
    const id = `image-${crypto.randomUUID()}`;
    // Fail before any provider work if crash/refund registration cannot be saved.
    const job: Job = { userId, state: "pending" };
    this.jobs.set(id, job);
    try { await this.persistence.register(id, userId, refundCount); }
    catch (error) { this.jobs.delete(id); throw error; }
    setImmediate(async () => {
      let result: ImageJobResult;
      try { result = await work(id); }
      catch {
        result = { status: 500, body: { success: false, message: "Billedgenereringen kunne ikke gennemføres." } };
      }
      try { await this.persistence.settle(id, result.status < 400 && result.body.success === true); }
      catch { console.error("[ImageJob] could not settle persistent job", id); }
      job.result = result;
      job.state = "completed";
      job.completedAt = Date.now();
    });
    return id;
  }

  get(id: string, userId: number) {
    const job = this.jobs.get(id);
    return job?.userId === userId ? job : undefined;
  }
}
