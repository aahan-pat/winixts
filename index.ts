import * as readline from "readline";
import { OllamaProvider } from "./core/models/ollama.js";
import { Bridge } from "./win/bridge.js";
import { createOrchestrator } from "./core/orchestrator.js";

function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function main(): Promise<void> {
    const bridge = new Bridge();
    const provider = new OllamaProvider("gpt-oss:120b-cloud");
    const orchestrator = createOrchestrator(bridge, provider);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log("Windows automation agent ready.");
    console.log('Type a task and press Enter. Type "exit" to quit.\n');

    try {
        while (true) {
            const input = await ask(rl, "> ");
            const task = input.trim();

            if (!task) continue;
            if (task.toLowerCase() === "exit") break;

            try {
                const result = await orchestrator.run(task);
                console.log(`\n${result}\n`);
            } catch (err) {
                console.error(`\nError: ${err}\n`);
            }
        }
    } finally {
        bridge.shutdown();
        rl.close();
    }
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
