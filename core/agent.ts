import type { LLMProvider, Message, Tool } from "./provider.js";

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Generic agent loop. Drives an LLM with a fixed tool set until it produces
 * a plain-text response (no tool calls), then returns that text.
 *
 * Callers supply an executor that maps tool names to actual implementations —
 * this keeps the loop agnostic about whether tools hit the OS, spawn another
 * agent, or do something else entirely.
 */
export class Agent {
    constructor(
        private readonly provider: LLMProvider,
        private readonly systemPrompt: string,
        private readonly tools: Tool[],
        private readonly executor: ToolExecutor,
        readonly label: string = "agent",
    ) {}

    async run(task: string): Promise<string> {
        const messages: Message[] = [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: task },
        ];

        while (true) {
            const response = await this.provider.chatWithTools(messages, this.tools);

            if (response.toolCalls?.length) {
                messages.push({ role: "assistant", content: response.content });

                for (const call of response.toolCalls) {
                    console.log(`  [${this.label}] → ${call.name}`, JSON.stringify(call.args));

                    let result: unknown;
                    try {
                        result = await this.executor(call.name, call.args);
                    } catch (err) {
                        result = { error: String(err) };
                    }

                    console.log(`  [${this.label}] ←`, JSON.stringify(result).slice(0, 400));
                    messages.push({ role: "tool", content: JSON.stringify(result) });
                }
                continue;
            }

            return response.content;
        }
    }
}
