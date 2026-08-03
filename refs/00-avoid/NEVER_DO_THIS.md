# 00 Anti-Patterns: BANNED UI CONCEPTS

This file contains explicit examples of what NOT to build. Our product is an engineering notebook, not a generic Web3 or AI startup. 

If any agent generates UI components, marketing pages, or layouts that resemble the following images, it is a critical failure. 

### 1. The Gradient & 3D Hero (`gradient_hero.jpg`, `overthetop_hero.jpg`)
*   **The Crime:** Relying on massive background color gradients, floating 3D chrome/glass shapes, and glowing particle nodes to create visual interest.
*   **The Law:** No gradients. No 3D. The visual world is chalk on slate, or graphite on ruled paper[cite: 3]. Backgrounds must use the solid `var(--bg-base)` OKLCH token exclusively[cite: 3]. 

### 2. Glowing Cards & Blurred Shadows (`ugly_highlights.jpg`, `agentsky.dev__ref=producthunt.jpg`)
*   **The Crime:** Using soft, glowing background blurs inside cards, neon text highlights, or colored ambient particle swooshes.
*   **The Law:** No glows[cite: 3]. No coloured shadows[cite: 3]. Every raised surface is defined exclusively by a 1px `var(--border-subtle)` hairline[cite: 3]. Separation is achieved by edge, not by blur[cite: 3]. 

### 3. The Rainbow Icon Grid (`glowing_huge_icons.jpg`)
*   **The Crime:** Using massive, multi-colored, heavily branded icons wrapped in gradient backgrounds. 
*   **The Law:** We rely on a rigorous monochrome base with a single accent used sparingly[cite: 3]. We enforce strict icon restraint[cite: 3]. The product's job is to disappear behind the user's content[cite: 3]. A grid of glowing neon logos completely violates this.

### 4. The "Gamer" Dashboard (`unusable_dashboard.jpg`)
*   **The Crime:** Heavy blocks of neon color (green/yellow), excessive pill-shaped containers, and low-contrast gradient fills on charts. The UI chrome competes with the data.
*   **The Law:** The interface must not look like "AI SaaS" or a trading terminal[cite: 3]. The accent color is for interaction and identity, never decoration, and should appear 0–2 times per screen[cite: 3]. UI chrome must utilize Geist Sans with strict size/color/space hierarchy, not heavy block fills[cite: 3].