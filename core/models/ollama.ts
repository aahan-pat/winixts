import type { LLMProvider, Message } from "../provider.js";
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
}
