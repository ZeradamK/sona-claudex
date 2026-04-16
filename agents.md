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
- Pinecone or pgvector
- NextAuth
- Claude Opus 4.7 for text reasoning
- Gemini 2.5 Flash for classification/fallback
- Gemini Live API for real-time native audio conversation

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
- Claude Opus 4.7 is primary for text reasoning.
- Gemini Flash is for fast classification and fallback.
- Particle sphere is functional voice feedback, not decorative.
- Dark theme first.
- All MCP tools should be surfaced as Claude tool/function calls.
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