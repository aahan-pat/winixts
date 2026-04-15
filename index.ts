import { OllamaProvider } from "./core/models/ollama.js";

const op = new OllamaProvider("gpt-oss:120b-cloud");

async function main(): Promise<void> {
    const response = await op.stream(
        [{ role: "user", content: "Explain quantum computing" }],
        (chunk) => process.stdout.write(chunk),
    );
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
