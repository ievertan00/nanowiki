# Personal Wiki CLI

A standalone Node.js CLI tool designed to maintain a personal wiki vault. Inspired by Andrej Karpathy's 3-layer architecture, it focuses on structured knowledge capture using LLMs to transform raw inputs or prompts into a rigid, queryable Markdown schema.

## 🚀 Features

- **3-Layer Architecture**: Sources (raw) → Wiki (curated) → Schema (structured Markdown).
- **Functional Knowledge**: Organizes notes by utility: `how`, `what`, `why`, and `fact`.
- **Hybrid Intelligence**: Uses LLMs for content generation while respecting local vault context for cross-linking and classification.
- **Automated Meta-Maintenance**: Automatically updates Maps of Content (MOC), flat indexes, and change logs.
- **Provider Agnostic**: Supports OpenAI-compatible endpoints (OpenAI, DeepSeek, Gemini, Ollama, etc.).

## 🛠️ Installation

1. **Clone the repository**:
   ```powershell
   git clone <repository-url>
   cd personal-wiki-cli
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Set up environment variables**:
   Copy the example environment file and fill in your details:
   ```powershell
   copy .env.example .env
   ```
   - `WIKI_PATH`: Path to your wiki vault directory.
   - `OPENAI_API_KEY`: Your API key.
   - `OPENAI_BASE_URL`: API endpoint (optional).

4. **Link the CLI (Optional)**:
   ```powershell
   npm link
   ```

## 📖 Usage

### Generating New Notes

Generate structured notes by type:

```powershell
wiki how "How to use Docker Compose"
wiki what "Generative Adversarial Networks"
wiki why "Why use TypeScript over JavaScript"
wiki fact "NVIDIA H100 Specifications"
```

### Rewriting Existing Content

Transform raw Markdown or text files into the wiki schema:

```powershell
wiki rewrite ./raw-notes/draft.md
```

### Options

- `--provider <name>`: Switch between LLM providers defined in your configuration.

## 📂 Vault Structure

The vault is organized into functional subdirectories:

- `how/`: Procedural notes (steps, code, pitfalls).
- `what/`: Conceptual notes (definitions, analogies, contrasts).
- `why/`: Reasoning notes (mechanisms, trade-offs, rationale).
- `fact/`: Structural/Reference data (entities, specifications).
- `meta/`: System files:
    - `MOC.md`: Map of Content (navigation hub).
    - `index.md`: Flat catalog by type.
    - `log.md`: Chronological log of changes.

## ⚙️ Configuration

You can customize the "Pillars" and LLM providers by creating a `wiki-config.json` file inside your `WIKI_PATH`:

```json
{
  "pillars": ["Coding", "AI", "Finance", "Life"],
  "providers": {
    "default": {
      "apiKey": "your-key",
      "baseURL": "https://api.openai.com/v1"
    },
    "deepseek": {
      "apiKey": "your-key",
      "baseURL": "https://api.deepseek.com"
    }
  }
}
```

## 🧪 Testing

Run the test suite:
```powershell
npm test
```

## 📜 License

ISC
