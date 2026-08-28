export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is RemiAI?",
    answer:
      "RemiAI is a self-hosted AI assistant that runs entirely on your own hardware. It combines deep file system integration, persistent memory, MCP tool support, and a multi-agent system, so you can work with AI without sending your files to the cloud.",
  },
  {
    question: "How is RemiAI different from ChatGPT or Claude?",
    answer:
      "RemiAI runs locally instead of in the cloud. Your conversations, files, and memory stay on your machine, it supports local models through Ollama, and it can read and write files inside directories you permit.",
  },
  {
    question: "Is my data stored locally?",
    answer:
      "Yes. RemiAI is private by design: no telemetry, no cloud dependencies, and encrypted backups. Your data never leaves your hardware unless you connect an external provider or tool yourself.",
  },
  {
    question: "Can I host RemiAI on my own server?",
    answer:
      "Yes. RemiAI is designed to be self-hosted on your own hardware. You can run it on your personal computer or a server you control, ensuring that your data remains private and secure.",
  },
  {
    question: "Which AI models can I use?",
    answer:
      "RemiAI works with local models via Ollama, and with hosted providers such as Anthropic and OpenAI. You can also bring your own provider or any API-compatible endpoint.",
  },
  {
    question: "What are the system requirements?",
    answer:
      "Node.js 18 or newer on macOS, Windows, or Linux. Setup takes about a minute: clone the repository, install dependencies, and run it with npm run dev.",
  },
  {
    question: "Is RemiAI free and open source?",
    answer:
      "Yes. RemiAI is open source under the MIT license and free to self-host. You only pay for the AI provider you choose, if any.",
  },
];
