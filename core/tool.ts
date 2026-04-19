import type { Tool } from "./provider.js";

/** Anything that can dispatch a method call — satisfied structurally by Bridge. */
export interface Callable {
    call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface ToolMeta {
    description: string;
    params?: Record<string, { type: string; description: string }>;
    required?: string[];
}

interface ToolEntry {
    schema: Tool;
    execute: (bridge: Callable, args: Record<string, unknown>) => Promise<unknown>;
}

const registry = new Map<string, ToolEntry>();

/**
 * Decorator that registers a static class method as an LLM-callable tool.
 *
 * @example
 * @tool({ description: "...", params: { hwnd: { type: "number", description: "..." } }, required: ["hwnd"] })
 * static getWindowInfo(bridge: Bridge, args: Record<string, unknown>) { ... }
 */
export function tool(meta: ToolMeta) {
    return function (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        fn: Function,
        context: ClassMethodDecoratorContext,
    ): void {
        const name = String(context.name);
        context.addInitializer(function () {
            registry.set(name, {
                schema: {
                    type: "function",
                    function: {
                        name,
                        description: meta.description,
                        parameters: {
                            type: "object",
                            properties: meta.params ?? {},
                            ...(meta.required?.length ? { required: meta.required } : {}),
                        },
                    },
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                execute: (bridge, args) => (fn as any)(bridge, args) as Promise<unknown>,
            });
        });
    };
}

/** Returns the JSON Schema tool definitions for every registered tool. */
export function getTools(): Tool[] {
    return [...registry.values()].map((e) => e.schema);
}

/** Dispatches a tool call by name through the registry. */
export function executeTool(
    bridge: Callable,
    name: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    const entry = registry.get(name);
    if (!entry) throw new Error(`Unknown tool: ${name}`);
    return entry.execute(bridge, args);
}
