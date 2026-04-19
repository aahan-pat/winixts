/** A single message in a conversation turn. */
export interface Message {
    /** The role of the message author. */
    role: "user" | "assistant" | "system" | "tool";
    /** The text content of the message. */
    content: string;
}

/** A single tool the model can call, in JSON Schema format. */
export interface Tool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, { type: string; description: string }>;
            required?: string[];
        };
    };
}

/** A tool call the model decided to make. */
export interface ToolCall {
    name: string;
    args: Record<string, unknown>;
}

/** Response from chatWithTools — either plain text, tool calls, or both. */
export interface ChatResponse {
    content: string;
    toolCalls?: ToolCall[];
}

/** Common interface for all LLM provider implementations. */
export interface LLMProvider {
    /** Display name of the provider (e.g. "ollama"). */
    name: string;

    /** Sends a conversation and returns the full response text. */
    chat(messages: Message[]): Promise<string>;

    /** Streams a response chunk-by-chunk. */
    stream(messages: Message[], onChunk?: (chunk: string) => void): Promise<void>;

    /** Sends a conversation with available tools and returns text and/or tool calls. */
    chatWithTools(messages: Message[], tools: Tool[]): Promise<ChatResponse>;
}
