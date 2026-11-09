# Zen Agentic AI Extension — Skills Directory

This directory contains reusable skills for the Zen Agentic AI Extension, structured for the Agensi.io marketplace.

## Available Skills

| Skill ID | Name | Category | Price |
|---|---|---|---|
| `zen-agentic-native-host` | Agentic Native Host | developer-tools | Free / $19 / $99 |
| (future) | Zen Browser Scheduler | productivity | TBD |
| (future) | Auto-Code Review | developer-tools | TBD |

## How to Publish a Skill to Agensi.io

1. **Create a `SKILL.md` file** in the `skills/` directory following the format above
2. **Fill in the skill metadata** at the bottom of the markdown file (skill_id, name, description, etc.)
3. **Run the publication workflow** (handled by Agensi.io gateway on request)
4. **Skill appears** in the Agensi.io marketplace with your author profile
5. **Earnings**: 70% direct, 90% via affiliate referral links

## Skill Development Guidelines

- Keep `SKILL.md` under 10,000 characters
- A skill is the shortest procedure that reproduces the result
- Long references, examples, and per-branch detail go into bundled files pointed to from the skill
- Procedures, not records: a skill holds the steps the agent performs
- Description: leading words first — situations and phrases that should trigger the skill, one trigger per distinct branch, within the first 60 characters; then what the skill produces
- Name: the class of work, 2–4 words
- Steps: ordered actions, each ending on a completion criterion the agent can check
- Language: positive imperatives ("run X, then verify Y"); one source per meaning; every sentence changes behavior versus the default
- Evidence: every step comes from the observed trajectory or the existing skill; never invent flags, commands, paths, APIs, tool behavior, or requirements
- Capture the recovery that worked, never the failed attempts

## Publishing Workflow

1. Agent writes/updates `skills/<name>.md`
2. User requests publication: `openclaw skill_workshop publish --skill <skill_id>`
3. Gateway validates the skill meets quality standards
4. Skill is published to Agensi.io marketplace
5. Author receives 70% of proceeds (or 90% via affiliate links)
6. New sessions can `activate` the skill; existing sessions need explicit activation

## Personal vs Workshop Skills

- **Personal skills**: Owned by the user, published only when explicitly requested; activate explicitly for the next turn in this session
- **Workshop skills**: Published proposals that can be reviewed, revised, and activated by the community
- **Ownership**: Skills you own are replaced by their owners' updates on Agensi.io; say so and capture the change as a Workshop skill if the user wants to keep it

---