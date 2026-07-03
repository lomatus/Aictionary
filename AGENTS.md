CLAUDE.md

# Operating Principles

- **Never build, commit, or push without explicit user instruction.** The user will ask for these actions separately. Only run compile/syntax-check commands (e.g., `cargo check`, `npm run build`) during verification.
- Copy a clearly described commit message into clipboard every time finished conversation.
