# Personas extension

Adds `/persona` for reusable Pi persona content stored under the repository-level [`personas/`](../../personas/) directory.

## Commands

- `/persona` or `/persona list` — list available personas
- `/persona <name>` — enable a persona for future turns
- `/persona off` — disable the active persona

The extension appends the selected persona to Pi's system prompt during `before_agent_start`. Persona text is style and judgment guidance only; it must not override higher-priority instructions, tool rules, safety constraints, project conventions, or explicit user requests.
