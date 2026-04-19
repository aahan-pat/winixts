import type { LLMProvider, Message, Tool, ChatResponse } from "../provider.js";
import { Ollama } from "ollama";

/** LLM provider backed by a local or remote Ollama instance. */
export class OllamaProvider implements LLMProvider {
    readonly name = "ollama";
    private readonly client: Ollama;
    private readonly model: string;

    /**
     * @param model - The Ollama model tag to use (e.g. "gpt-oss:120b-cloud").
     * @param host  - Ollama server URL. Defaults to http://localhost:11434.
     */
    constructor(model: string, host?: string) {
        this.model = model;
        this.client = new Ollama({ host: host ?? "http://localhost:11434" });
    }

    /** Sends messages and returns the full response text. */
    async chat(messages: Message[]): Promise<string> {
        const response = await this.client.chat({
            model: this.model,
            messages,
            stream: false,
        });
        return response.message.content;
    }

    /** Streams the response, calling `onChunk` for each content chunk received. */
    async stream(messages: Message[], onChunk?: (chunk: string) => void): Promise<void> {
        const response = await this.client.chat({
            model: this.model,
            messages,
            stream: true,
        });

        for await (const part of response) {
            const chunk = part.message.content;
            if (chunk) {
                onChunk?.(chunk);
            }
        }
    }

    /**
     * Sends messages with tool definitions. If the model decides to call tools,
     * the response will carry toolCalls instead of (or alongside) plain text.
     * The caller is responsible for executing the tools and continuing the loop.
     */
    async chatWithTools(messages: Message[], tools: Tool[]): Promise<ChatResponse> {
        const response = await this.client.chat({
            model: this.model,
            messages,
            tools,
            stream: false,
        });

        // Normalise the ollama tool_calls shape into our ToolCall type.
        const toolCalls = response.message.tool_calls?.map((tc) => ({
            name: tc.function.name,
            args: tc.function.arguments as Record<string, unknown>,
        }));

        return {
            content: response.message.content ?? "",
            ...(toolCalls?.length ? { toolCalls } : {}),
        };
    }
}
