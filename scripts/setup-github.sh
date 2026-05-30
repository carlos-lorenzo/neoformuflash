#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-carlos-lorenzo/neoformuflash}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required. Install GitHub CLI and run 'gh auth login'."
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "gh is not authenticated. Run 'gh auth login' and re-run this script."
  exit 1
fi

create_label() {
  local name="$1"
  local color="$2"
  local desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force
}

create_milestone() {
  local title="$1"
  local desc="$2"
  local exists="no"

  while read -r line; do
    if python3 - "$title" <<'PY'
import json
import sys

title = sys.argv[1]
try:
  data = json.loads(sys.stdin.read())
except json.JSONDecodeError:
  sys.exit(0)
if any(m.get("title") == title for m in data):
  sys.exit(1)
PY
    then
      :
    else
      exists="yes"
      break
    fi
  done < <(gh api "repos/$REPO/milestones?state=all" --paginate)

  if [[ "$exists" == "yes" ]]; then
    echo "Milestone exists: $title"
  else
    gh api -X POST "repos/$REPO/milestones" -f title="$title" -f description="$desc"
  fi
}

create_label "area/foundation" "1f6feb" "Foundation and setup"
create_label "area/hierarchy" "7ee787" "Institution, course, topic, resource"
create_label "area/notes" "d2a8ff" "Notes and editor"
create_label "area/decks-fsrs" "ffa657" "Decks and FSRS review"
create_label "area/exams" "8b949e" "Exam builder"
create_label "area/rag-ai" "f78166" "RAG pipeline and AI"
create_label "area/billing" "56d364" "Stripe and entitlements"
create_label "area/discovery-seo" "79c0ff" "Discovery and SEO"

create_milestone "Milestone 1 - Foundation" "Scaffold, Supabase utilities, auth/profile."
create_milestone "Milestone 2 - Authoring & Study" "Hierarchy CRUD, notes, decks, FSRS, exams."
create_milestone "Milestone 3 - AI & RAG" "Chunking, embeddings, vector search, streaming, generation."
create_milestone "Milestone 4 - Discovery & Billing" "Discovery, SEO, Stripe billing, entitlements."

# Foundation
for issue in 12 1 2; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 1 - Foundation" --add-label "area/foundation"
done

# Authoring & Study
for issue in 3 4 5 6; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 2 - Authoring & Study" --add-label "area/hierarchy"
done
for issue in 7 8 9; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 2 - Authoring & Study" --add-label "area/notes"
done
for issue in 10 11 13; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 2 - Authoring & Study" --add-label "area/decks-fsrs"
done
for issue in 14; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 2 - Authoring & Study" --add-label "area/exams"
done

# AI & RAG
for issue in 15 16 17 18 19; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 3 - AI & RAG" --add-label "area/rag-ai"
done

# Discovery & Billing
for issue in 20 21 22; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 4 - Discovery & Billing" --add-label "area/billing"
done
for issue in 23 24 25; do
  gh issue edit "$issue" --repo "$REPO" --milestone "Milestone 4 - Discovery & Billing" --add-label "area/discovery-seo"
done

echo "Labels and milestones applied."
