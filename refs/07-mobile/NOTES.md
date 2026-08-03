# 07 Mobile & Ergonomics

This folder defines the mechanical rules for mobile-first interactions, focusing on thumb-zone ergonomics, asymmetrical action bars, and maximizing vertical screen real estate for content.

*   **Asymmetrical Bottom Action Bars (`mobile_thumb_actions.jpg`, `stats_dashboard.jpg`):** Instead of a traditional, uniformly spaced tab bar, mobile core actions are housed in a floating, pill-shaped container anchored near the bottom edge (approx. 16px–24px from the bottom). The layout is intentionally unbalanced to prioritize ergonomics and hierarchy:
    *   The primary action (e.g., a dark "Edit" button or "Start workout" pill) is given the largest touch target or highest contrast, often anchored to the right side for easy thumb access.
    *   Secondary inputs (like an "Ask anything" prompt) stretch flexibly to fill the remaining space, functioning more like a quick-access command line than a static navigation link.
*   **Glanceable Data Cards (`stats_dashboard.jpg`):** Mobile dashboards use stark contrast and scale rather than dense tables. Primary metrics utilize massive typography (often 40px+) and inverted high-contrast cards (e.g., white text on a black background) to establish an immediate focal point. Secondary metrics use significantly reduced visual weight (gray text, small pill icons) to provide context without competing for attention.
*   **Distraction-Free Reading Canvas (`fullscreen_text.jpg`):** When the mobile user is reading long-form text, all navigation chrome (headers, footers) recedes. The layout strictly enforces readability:
    *   Backgrounds shift to a warm, off-white hue to reduce eye strain.
    *   Typography utilizes a highly legible serif font with a generous `line-height` (approx. 1.5 to 1.6).
    *   Highlights are achieved through a soft, low-contrast background color (like pale yellow) rather than changing the text color or weight, ensuring the structural reading flow is uninterrupted.