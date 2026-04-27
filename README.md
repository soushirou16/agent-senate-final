# Senate Insight Demo (Milestone 3 Skeleton)

Next.js App Router proof-of-concept focused on:

- topic-first research storytelling
- filterable exploration (`single/debate`, `role/no-role`, topic spectrum, agent, role)
- static packaged JSON designed for large local data payloads
- non-invasive in-app feedback collection (local only, exportable JSON)


## Run

1. Add your Supabase credentials to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

2. Install and start:

```bash
npm install
npm run generate:demo-data
npm run dev
```

## Route map

- `/` main page
- `/topics` topic index
- `/topics/[slug]` topic story detail
- `/explorer` prompt-level filtering and inspection
- `/visualizations` chart placeholders with real wiring
- `/methodology` study/app explanation and feedback field disclosure
- `/about` project overview

## Data packaging strategy

Data is loaded from `public/data` using a manifest:

- `public/data/manifest.json`
- `public/data/questions/<topic>.json`
- `public/data/conversations/<topic>.json`
- `public/data/metrics/overview.json`

The UI uses `src/lib/data-client.ts` and `src/hooks/use-study-data.ts`, so moving to API routes later is isolated to the data layer.

## User response storage

User responses are written to a Supabase database in real time as participants move through each topic. Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

### Tables

**`study_sessions`** — one row created when a participant opens a topic page.

- `topic_slug`, `topic_title`

**`choose_argument_responses`** — one row per "Choose the Argument" submission (stages `sample_1`, `sample_2`, `sample_3`).

- `session_id`, `stage`, `question_number`, `question_external_id`, `question_text`
- `selected_argument` (e.g. `Argument A`)
- `selected_model` (agent name, e.g. `Claude`)
- `optional_note`

**`judgment_check_responses`** — one row per "Judgment Check" submission (stages `sample_1`, `sample_2`, `sample_3`, `data`, `final`).

- `session_id`, `stage`, `question_number`, `question_external_id`, `question_text`
- `vote` (`yes` / `no` / `maybe` / `undecided`)
- `certainty_score` (1–5)
- `evidence_move_score` (1–5)
- `note`

Responses are upserted on conflict `(session_id, stage)`, so re-submitting updates the existing row. localStorage is kept as a local backup and remains exportable via the feedback dock.
