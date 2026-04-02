import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

export interface TerminalEntry {
  id: string;
  process: ChildProcess;
  command: string;
  args: string[];
  output: string;
  outputByteLimit: number;
  exitCode: number | null;
  signal: string | null;
  exited: boolean;
  exitPromise: Promise<void>;
}

export class TerminalManager {
  private terminals = new Map<string, TerminalEntry>();

  create(opts: {
    command: string;
    args?: string[];
    cwd?: string | null;
    env?: Array<{ name: string; value: string }>;
    outputByteLimit?: number | null;
  }): string {
    const id = `term_${randomUUID().slice(0, 8)}`;
    const args = opts.args ?? [];
    const envObj = opts.env
      ? Object.fromEntries(opts.env.map((e) => [e.name, e.value]))
      : undefined;

    let cwd = opts.cwd ?? undefined;
    if (cwd && !existsSync(cwd)) {
      console.warn(`[TerminalManager] cwd "${cwd}" does not exist locally, falling back to ${process.cwd()}`);
      cwd = undefined;
    }

    const proc = spawn(opts.command, args, {
      cwd,
      env: envObj ? { ...process.env, ...envObj } : process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const entry: TerminalEntry = {
      id,
      process: proc,
      command: opts.command,
      args,
      output: "",
      outputByteLimit: opts.outputByteLimit ?? 1_000_000,
      exitCode: null,
      signal: null,
      exited: false,
      exitPromise: Promise.resolve(),
    };

    const appendOutput = (chunk: Buffer) => {
      entry.output += chunk.toString();
      if (Buffer.byteLength(entry.output) > entry.outputByteLimit) {
        const buf = Buffer.from(entry.output);
        entry.output = buf.subarray(buf.length - entry.outputByteLimit).toString();
      }
    };

    proc.stdout?.on("data", appendOutput);
    proc.stderr?.on("data", appendOutput);

    entry.exitPromise = new Promise<void>((resolve) => {
      proc.on("exit", (code, sig) => {
        entry.exitCode = code;
        entry.signal = sig ?? null;
        entry.exited = true;
        resolve();
      });
      proc.on("error", (err) => {
        entry.output += `\n[error: ${err.message}]`;
        entry.exited = true;
        entry.exitCode = 1;
        resolve();
      });
    });

    this.terminals.set(id, entry);
    return id;
  }

  get(id: string): TerminalEntry | undefined {
    return this.terminals.get(id);
  }

  async waitForExit(id: string): Promise<{ exitCode: number | null; signal: string | null }> {
    const entry = this.terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    await entry.exitPromise;
    return { exitCode: entry.exitCode, signal: entry.signal };
  }

  kill(id: string): void {
    const entry = this.terminals.get(id);
    if (!entry || entry.exited) return;
    entry.process.kill("SIGTERM");
  }

  release(id: string): void {
    const entry = this.terminals.get(id);
    if (!entry) return;
    if (!entry.exited) {
      entry.process.kill("SIGKILL");
    }
    this.terminals.delete(id);
  }

  releaseAll(): void {
    for (const id of this.terminals.keys()) {
      this.release(id);
    }
  }
}
