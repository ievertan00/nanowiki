import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

export function loadConfig() {
  const wikiPath = process.env.WIKI_PATH;
  if (!wikiPath) {
    throw new Error("WIKI_PATH is required.");
  }

  const configPath = path.join(wikiPath, "wiki-config.json");
  let userConfig = {};
  if (fs.existsSync(configPath)) {
    userConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  const localAddress = process.env.LOCAL_ADDRESS || undefined;

  return {
    wikiPath,
    domains: userConfig.domains || {},
    providers: userConfig.providers || {
      gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        baseURL:
          process.env.GEMINI_BASE_URL ||
          "https://generativelanguage.googleapis.com/v1beta/openai/",
        model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
      },
      qwen: {
        apiKey: process.env.QWEN_API_KEY,
        baseURL:
          process.env.QWEN_BASE_URL ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: process.env.QWEN_MODEL || "qwen3.6-max-preview",
        directConnection: true,
        localAddress,
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
        directConnection: true,
        localAddress,
      },
      ollama: {
        apiKey: process.env.OLLAMA_API_KEY || "ollama",
        baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
        model: process.env.OLLAMA_MODEL || "gemma4:e4b",
      },
    },
  };
}

export function saveTaxonomy(wikiPath, config, domain, topic) {
  if (!domain) return;
  if (!config.domains) config.domains = {};

  let changed = false;
  if (!config.domains[domain]) {
    config.domains[domain] = [];
    changed = true;
  }
  if (topic && !config.domains[domain].includes(topic)) {
    config.domains[domain].push(topic);
    changed = true;
  }

  if (!changed) return;

  const configPath = path.join(wikiPath, "wiki-config.json");
  let existing = {};
  if (fs.existsSync(configPath)) {
    existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  existing.domains = config.domains;
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
}
