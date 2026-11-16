import { DurableObject } from "cloudflare:workers";
import { randomId } from "./auth";
import type { Ctx, Env, User } from "./env";
import { kvBucket } from "./kvstore";
import { runTranscription, type TranscribeArgs } from "./server";
import { withSavedKeys } from "./setup";
import { spend } from "./storage";

/**
 * Long jobs (best-quality transcription takes minutes) cannot run inside one MCP tool call:
 * phone/web clients stop waiting after ~60 s. Each job lives in its own Durable Object; an
 * alarm runs it in the background (alarms may run up to 15 minutes), and transcribe_result
 * reads its status, which is strongly consistent.
 */

interface JobRecord {
  id: string;
  user: User;
  origin: string;
  args: TranscribeArgs;
  status: "running" | "done" | "error";
  started: string;
  finished?: string;
  result?: unknown;
  error?: string;
}

export class Jobs extends DurableObject<Env> {
  async start(job: JobRecord) {
    await this.ctx.storage.put("job", job);
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  async status(): Promise<JobRecord | null> {
    return (await this.ctx.storage.get<JobRecord>("job")) ?? null;
  }

  async alarm() {
    // The second alarm (a week after the job) only clears storage.
    if (await this.ctx.storage.get("cleanup")) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const job = await this.ctx.storage.get<JobRecord>("job");
    if (!job || job.status !== "running") return;
    let env: Env = this.env.FILES ? this.env : { ...this.env, FILES: kvBucket(this.env.STORE!) };
    env = await withSavedKeys(env);
    const ctx: Ctx = { env, user: job.user, origin: job.origin, waitUntil: (p) => this.ctx.waitUntil(p) };
    try {
      job.result = await runTranscription(ctx, job.args);
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = String((e as Error)?.message ?? e).slice(0, 1500);
      await spend(ctx, "transcribe", -1).catch(() => {});
    }
    job.finished = new Date().toISOString();
    await this.ctx.storage.put({ job, cleanup: true });
    await this.ctx.storage.setAlarm(Date.now() + 7 * 24 * 3600 * 1000);
  }
}

function stub(env: Env, jobId: string) {
  if (!env.JOBS) throw new Error("JOBS Durable Object is not configured on the server.");
  return env.JOBS.get(env.JOBS.idFromName(jobId)) as unknown as Jobs;
}

export async function startTranscriptionJob(ctx: Ctx, args: TranscribeArgs): Promise<string> {
  const id = `tr_${randomId(12)}`;
  await stub(ctx.env, id).start({
    id,
    user: ctx.user,
    origin: ctx.origin,
    args,
    status: "running",
    started: new Date().toISOString(),
  });
  return id;
}

export async function jobStatus(ctx: Ctx, jobId: string): Promise<JobRecord> {
  if (!/^tr_[A-Za-z0-9_\-]{8,}$/.test(jobId)) throw new Error("Unknown job_id.");
  const j = await stub(ctx.env, jobId).status();
  if (!j || j.user.name !== ctx.user.name) throw new Error("Unknown job_id.");
  return j;
}
