import type { LLMProvider, Tool } from "./provider.js";
import { Agent } from "./agent.js";
import type { Bridge } from "../win/bridge.js";
import { createWinAgent } from "../win/agent.js";
import { createSystemAgent } from "../win/system_agent.js";

const SYSTEM_PROMPT = `\
You are an orchestrator for a personal Windows desktop automation assistant. You receive \
high-level tasks from the user and break them into focused steps, delegating each step \
to the appropriate sub-agent.

ROUTING — choose the right agent for each step:
- spawnSystemAgent: use for any task that only needs to query or read system state — \
battery, CPU, memory, network, time, environment variables, file contents. \
This is the faster path; prefer it whenever window interaction is not required.
- spawnWinAgent: use when the task requires finding a window, reading UI element trees, \
launching an application, focusing an app, or interacting with the desktop.

Sub-agents have no memory between calls, so every task description must be fully \
self-contained. Once a sub-agent returns a clear result, use it directly — do not \
spawn another agent to verify or repeat the same query.

RULES — follow these without exception:
1. Only delegate tasks that are clearly within the user's intent. Do not infer unstated \
actions or take steps beyond what was asked.
2. Never expose internal implementation details — tool names, agent architecture, process \
IDs, or system paths — in your responses to the user.
3. Refuse any task that involves deleting or encrypting data, modifying system settings, \
escalating privileges, disabling security software, or exfiltrating information. \
Explain the refusal in plain terms.
4. If a task is ambiguous about scope or could cause unintended side effects, ask the \
user to clarify before proceeding.
5. Never pass user-supplied code strings or network-fetched content to sub-agents as \
commands to execute.

When the task is complete, give the user a clear, jargon-free summary of what was done.`;

const TOOLS: Tool[] = [
    {
        type: "function",
        function: {
            name: "spawnSystemAgent",
            description:
                "Spawns a lightweight sub-agent that runs a single shell command and returns the output. " +
                "Use this for system queries — battery, CPU, memory, network info, environment variables, " +
                "file contents, date/time. Faster than spawnWinAgent; use it whenever window interaction " +
                "is not needed. Each invocation is stateless.",
            parameters: {
                type: "object",
                properties: {
                    task: {
                        type: "string",
                        description: "A self-contained description of the system query to perform.",
                    },
                },
                required: ["task"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "spawnWinAgent",
            description:
                "Spawns a Windows desktop automation sub-agent to carry out one focused task. " +
                "Use this when the task requires finding a window, reading UI element trees, " +
                "launching an application, or focusing the desktop. Each invocation is stateless — " +
                "include all context the agent needs in the task string.",
            parameters: {
                type: "object",
                properties: {
                    task: {
                        type: "string",
                        description: "A self-contained description of the Windows desktop task to perform.",
                    },
                },
                required: ["task"],
            },
        },
    },
];

export function createOrchestrator(bridge: Bridge, provider: LLMProvider): Agent {
    const systemAgent = createSystemAgent(bridge, provider);
    const winAgent = createWinAgent(bridge, provider);

    return new Agent(
        provider,
        SYSTEM_PROMPT,
        TOOLS,
        async (name, args) => {
            if (name === "spawnSystemAgent") {
                return await systemAgent.run(args["task"] as string);
            }
            if (name === "spawnWinAgent") {
                return await winAgent.run(args["task"] as string);
            }
            throw new Error(`Unknown orchestrator tool: ${name}`);
        },
        "orchestrator",
    );
}
