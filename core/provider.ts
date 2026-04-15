/** A single message in a conversation turn. */
export interface Message {
    /** The role of the message author. */
    role: "user" | "assistant" | "system";
    /** The text content of the message. */
    content: string;
}

/** Common interface for all LLM provider implementations. */
export interface LLMProvider {
    /** Display name of the provider (e.g. "ollama"). */
    name: string;

    /**
     * Sends a conversation and returns the full response text.
     * @param messages - The conversation history to send.
     */
    chat(messages: Message[]): Promise<string>;

    /**
     * Streams a response chunk-by-chunk, invoking `onChunk` as each piece arrives.
     * @param messages - The conversation history to send.
     * @param onChunk - Optional callback invoked for each streamed content chunk.
     */
    stream(messages: Message[], onChunk?: (chunk: string) => void): Promise<void>;
}
