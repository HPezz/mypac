---
name: pac-deep-read
description: "Analyze substantial documents beyond summary by inferring implications, surfacing tensions, extracting a core takeaway, and identifying blind spots. Use when the user explicitly asks for a deep or critical reading, hidden implications, tensions, contradictions, or blind spots—not for an ordinary summary."
license: MIT
compatibility: Pi coding agent
metadata:
  author: mypac
  stage: shared
---

# Deep-read a document

Analyze substantial written material beyond summary. Work from document content already available in the conversation or supplied by the user; if the target is missing or ambiguous, ask for it rather than inventing content.

Use one of two modes:

- **Concise mode (default):** use unless the user requests long, rigorous, evidence-backed, or detailed analysis.
- **Rigorous / evidence mode:** use when the user makes one of those requests or explicitly selects rigorous mode.

Infer carefully. Distinguish the author's claims from your inferences, ground conclusions in the source, and do not manufacture entries for categories that genuinely do not apply.

## Concise mode

Use these sections in order, keeping each to roughly 2–3 sentences:

1. **Non-obvious insights (inferred):** identify 3–5 implications not explicitly stated by the author.
2. **Tensions / contradictions:** surface internal tensions, unresolved tradeoffs, or places where the argument sits uneasily with conventional wisdom.
3. **Core takeaway:** give one actionable implication—or one important reframing for a theoretical text—and explain why it matters.
4. **Blind spots:** identify external perspectives, data, or questions the author should engage with but does not.

If a category genuinely does not apply, say so briefly.

## Rigorous / evidence mode

Write concise bullets with one sentence per bullet. Provide 3–5 Insights, 2–4 Tensions, exactly 1 Takeaway, and 2–4 Blind spots unless a category genuinely does not apply; in that case, say so briefly rather than manufacturing an entry.

Use this output contract:

### 1) Non-obvious insights (inferred)

For every Insight include:

- **Insight:** an inference not explicitly stated by the author.
- **Evidence:** a short verbatim excerpt from the document, approximately 5–12 words.
- **Assumption:** the key assumption required for the inference.
- **Confidence:** High / Med / Low.

### 2) Tensions / contradictions

For every Tension include:

- **Tension:** the conflict, tradeoff, or unresolved point.
- **Evidence:** a short verbatim excerpt from the document, approximately 5–12 words.
- **Why it conflicts / what remains unresolved:** the source of the tension.

### 3) Core takeaway

Include:

- **Takeaway:** the single most important actionable implication, or reframing for a theoretical text.
- **Why it matters:** its significance.
- **Suggested next step:** a proportionate follow-up.

### 4) Blind spots

For every Blind spot include:

- **Blind spot:** the missing perspective, data, or question.
- **Why it matters:** the consequence of the omission.
- **What would resolve it (data / perspective / question):** the evidence or inquiry needed.

### 5) Next action

Include this section only when the provided material contains enough organizational context to identify a meaningful action, owner, output, and success criteria. Omit it when organizational context is absent.

- **Action:** the concrete action.
- **Owner (role/name):** the responsible role or person.
- **Output expected (artifact/decision):** the deliverable.
- **Success criteria:** the observable completion condition.

## Example

A request to “deep-read this strategy memo” uses concise mode; “give me a long, evidence-backed deep read of this strategy memo” uses rigorous / evidence mode.
