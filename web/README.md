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
python -m uvicorn server.api:app --host 127.0.0.1 --port 8001 --reload
```

## Vercel deploy

Set the Vercel project Root Directory to `web`.

Add these environment variables in Vercel Project Settings:

```bash
UPSTAGE_API_KEY=your-upstage-api-key
UPSTAGE_MODEL=solar-pro4
UPSTAGE_EMBEDDING_PASSAGE_MODEL=solar-embedding-2-passage
UPSTAGE_EMBEDDING_QUERY_MODEL=solar-embedding-2-query
```

Vercel uses `api/chat.ts` directly, so the deployed site does not need the Python FastAPI server or local Chroma DB.
