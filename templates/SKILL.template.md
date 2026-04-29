---
name: your-skill-name
description: One-line description of when this skill triggers.
---

# Skill Title

## When to Use

- Describe user requests or repository states that trigger this skill.

## Required Inputs

- List the minimum inputs needed for this skill to run.
- Clarify which inputs can be omitted and filled by auto-detection.

## Auto-Detection

- What this skill should preferentially check.
- Priority: explicit user input > Project Profile > workspace clues > defaults.

## Steps

1. Describe the execution flow in order.
2. Be specific enough to ensure safe execution.
3. State default commands, modes, or artifact preferences.

## Failure Triage

- Map common failures to categories in `shared/failure-taxonomy.md`.
- State when to stop and ask rather than guess.

## Platform Notes

- Only include host platform differences that affect this skill's execution.

## Output Contract

- Define expected status, summary, evidence, and next action.
- List which Project Profile fields this skill adds or updates.

## Handoff

- Which downstream skill should receive the result on success, partial success, or block.
