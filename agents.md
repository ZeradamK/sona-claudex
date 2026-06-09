# AGENTS.md

## Project
Sona is being built from scratch as a web-first AI assistant MVP.

This repository starts with the MVP only:
- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Three.js via @react-three/fiber + @react-three/drei
- Zustand
- Prisma + PostgreSQL
- Redis
- pgvector (Postgres) for memory/embeddings
- NextAuth
- Gemini 2.5 Flash for text reasoning, classification, and memory extraction (all-Gemini runtime)
- Gemini Live API for real-time native audio conversation
- Gemini computer-use / browser-control for Phase 6 web-agent tasks (e.g. food ordering)

## Source of truth
- The attached MVP build plan is the product and architecture source of truth.
- `design.md` is the visual source of truth.
- If implementation instructions conflict with `design.md`, `design.md` wins for UI.

## Non-negotiable constraints
- Build from scratch. Do not assume prior Sona infrastructure exists.
- Web MVP comes first.
- Do not start desktop or mobile packaging unless explicitly asked after MVP completion.
- Word-by-word streaming only for assistant text.
- No line-by-line append logic.
- No character-by-character streaming.
- Google Sans Text is the primary font everywhere.
- Maximum font weight is 500.
- Do not redesign the input field if design.md defines it.
- Voice must use Gemini Live native audio over WebSocket, not STT→LLM→TTS chaining.
- Gemini 2.5 Flash is primary for text reasoning (all-Gemini runtime; no second LLM vendor).
- Gemini Flash also handles fast classification, content filtering, and post-turn memory extraction.
- Particle sphere is functional voice feedback, not decorative.
- Dark theme first.
- All MCP tools should be surfaced as Gemini function calls.
- Test after each build phase.

## Work style
- Inspect the repo before changing architecture.
- Plan before coding.
- Implement only the requested phase.
- Keep code modular and reusable.
- Prefer stable backend contracts that can later support Tauri/mobile without rewrites.

## Output format for every task
1. What you changed
2. Files added/modified
3. Commands to run
4. Verification checklist
5. Risks / follow-ups