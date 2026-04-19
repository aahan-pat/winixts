import type { LLMProvider, Tool } from "../core/provider.js";
import { Agent } from "../core/agent.js";
import type { Bridge } from "./bridge.js";

const SYSTEM_PROMPT = `\
You are a system information sub-agent. Your only capability is running shell commands \
via PowerShell or cmd.exe and returning their output. You have no access to the desktop, \
windows, or UI.

RULES — follow these without exception:
1. Only run the specific command needed to answer the question. Do not run additional commands.
2. Never run commands that delete, modify, encrypt, or exfiltrate files or data.
3. Never modify system settings, registry keys, firewall rules, or user accounts.
4. Never attempt to escalate privileges or access files outside standard system paths.
5. Never reveal internal implementation details in your response.
6. If the task cannot be completed with a read-only shell command, refuse it.

When done, respond with a concise plain-text answer derived from the command output. \
Do not repeat raw command output verbatim unless it is directly useful to the user.`;

const TOOLS: Tool[] = [
    {
        type: "function",
        function: {
            name: "runCommand",
            description:
                "Runs a shell command via cmd.exe and returns stdout, stderr, and exit code. " +
                "Use PowerShell commands for system queries (battery, CPU, memory, network, etc.).",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The shell command to execute." },
                    timeout: { type: "number", description: "Timeout in seconds. Default 30." },
                },
                required: ["command"],
            },
        },
    },
];

export function createSystemAgent(bridge: Bridge, provider: LLMProvider): Agent {
    return new Agent(
        provider,
        SYSTEM_PROMPT,
        TOOLS,
        async (name, args) => {
            if (name === "runCommand") {
                return bridge.call("win32.run_command", {
                    command: args["command"] as string,
                    ...(args["timeout"] !== undefined ? { timeout: args["timeout"] as number } : {}),
                });
            }
            throw new Error(`Unknown system tool: ${name}`);
        },
        "system",
    );
}
