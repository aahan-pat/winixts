// Manages the lifecycle of the Python subprocess and owns the communication
// channel. Responsible for:
// - Spawning python/win_agent.py as a child process on startup
// - Writing newline-delimited JSON requests to the process's stdin
// - Reading and parsing JSON responses from stdout
// - Matching responses back to their originating requests (by request ID)
// - Handling the retry loop for focus-stealing failures
// - Restarting the Python process if it crashes unexpectedly
//
// All other TypeScript files go through this — nothing talks to Python
// directly except bridge.ts.
import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve win/bridge.ts → ../python/win_agent.py regardless of cwd.
const AGENT_PATH = join(__dirname, "..", "python", "win_agent.py");

type Pending = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
};

export class Bridge {
    private proc: ChildProcess;
    private pending = new Map<string, Pending>();
    private nextId = 0;

    constructor() {
        this.proc = this.spawn();
    }

    private spawn(): ChildProcess {
        const proc = spawn("py", [AGENT_PATH], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        // Log Python stderr to our stderr so errors are visible.
        proc.stderr?.on("data", (data: Buffer) =>
            process.stderr.write(`[win_agent] ${data.toString()}`),
        );

        // Parse stdout line by line — each line is one complete JSON response.
        const rl = createInterface({ input: proc.stdout! });
        rl.on("line", (line) => this.onLine(line));

        proc.on("exit", (code) => {
            // Reject every request that was waiting when the process died.
            for (const [, { reject }] of this.pending) {
                reject(new Error(`win_agent exited unexpectedly (code ${code})`));
            }
            this.pending.clear();

            // Restart automatically unless we closed it intentionally.
            if (!this.shutdownRequested) {
                console.error("[bridge] win_agent crashed — restarting...");
                this.proc = this.spawn();
            }
        });

        return proc;
    }

    private shutdownRequested = false;

    private onLine(line: string): void {
        let response: { id: string; result?: unknown; error?: string };
        try {
            response = JSON.parse(line);
        } catch {
            console.error("[bridge] Unparseable response:", line);
            return;
        }

        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);

        if (response.error !== undefined) {
            pending.reject(new Error(response.error));
        } else {
            pending.resolve(response.result);
        }
    }

    /** Send a method call to win_agent.py and return the result. */
    call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
        const id = String(this.nextId++);
        const line = JSON.stringify({ id, method, params }) + "\n";

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.proc.stdin!.write(line);
        });
    }

    /** Cleanly shut down the Python process. */
    shutdown(): void {
        this.shutdownRequested = true;
        this.proc.stdin!.end();
    }
}
