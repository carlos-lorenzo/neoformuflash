# GitHub Issue Setup

This repo uses labels and milestones to sequence work for LLM-friendly development tasks.

## One-time setup
1. Install GitHub CLI: https://cli.github.com/
2. Authenticate: `gh auth login`
3. Run the script from repo root:
   - `bash scripts/setup-github.sh`

## What the script does
- Creates area labels for each workstream.
- Creates four milestones aligned to the roadmap.
- Assigns all existing issues to milestones and labels.

If you fork the repo, pass the repo name:
- `bash scripts/setup-github.sh your-org/your-repo`
