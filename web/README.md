# Kim Seonghyeon Portfolio Web

Vite + React portfolio with a Vercel serverless RAG chatbot.

## Local development

```bash
npm install
npm run dev
```

Local `npm run dev` still proxies `/api/chat` to the Python RAG server through `RAG_API_URL`.
For local full-stack testing, run the backend from the repository root first:

```bash
python -m uvicorn server.api:app --host 127.0.0.1 --port 8000 --reload
```

## Vercel deploy

Set the Vercel project Root Directory to `web`.

Add these environment variables in Vercel Project Settings:

```bash
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Vercel uses `api/chat.ts` directly, so the deployed site does not need the Python FastAPI server or local Chroma DB.
