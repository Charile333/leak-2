# Copilot Instructions

## Project Overview
- This is a Vite + React 19 + TypeScript frontend with Tailwind CSS v4 styling.
- The product is a cyber threat intelligence / leak monitoring platform.
- The UI should feel like a security operations product, not a generic SaaS dashboard.
- Motion is an intentional part of the experience and is implemented with framer-motion.

## Design Context

### Users
This product is for teams working with cyber threat intelligence, leak monitoring, and security investigation workflows. They use it to monitor exposed assets, inspect leaked credentials and related indicators, and move from detection to assessment with confidence. The interface should support focused desktop analysis first, while remaining usable on smaller screens for quick checks.

### Brand Personality
The brand should feel authoritative, calm, and forward-looking. Its tone should communicate technical competence, trust, and operational readiness rather than consumer friendliness or startup playfulness. The product should feel like a serious intelligence console that helps users stay in control.

### Aesthetic Direction
The visual direction is dark, technical, and high-trust, with layered depth instead of flat panels. Public-facing surfaces use the blue brand accent, while authenticated functional pages intentionally shift toward a purple-accented operational theme. Reuse blurred cards, restrained glow, radial gradients, subtle noise, and motion-driven transitions so the experience feels cinematic on marketing pages and precise on internal workflow pages.

There are no explicit external style references or anti-references defined yet. Accessibility requirements are not explicitly specified, so default to clear hierarchy, readable contrast, and motion that feels polished without becoming distracting.

### Design Principles
1. Design for trust first: every screen should feel precise, stable, and credible enough for security and intelligence work.
2. Preserve dual-mode theming: keep blue-led storytelling for public pages and purple-led operational emphasis for authenticated console pages.
3. Use atmosphere with restraint: depth, blur, gradients, and glow should support hierarchy and mood without turning into noisy neon effects.
4. Prioritize analytical clarity: dense data views should remain scannable, structured, and readable before adding decoration.
5. Keep motion purposeful: transitions should reinforce orientation, reveal hierarchy, and make the product feel advanced without slowing users down.

## Styling Guidance
- Reuse existing CSS variables and Tailwind color names before inventing new ones.
- Core styling tokens live in `src/index.css` and `tailwind.config.js`.
- Default background is very dark (`#080C12`) with layered gradients and subtle texture.
- Default accent is blue for public pages.
- Authenticated functional pages intentionally use the purple accent defined by `.functional-theme`.
- Prefer rounded-xl and rounded-2xl surfaces over exaggerated pillowy shapes unless the surrounding design already uses them.
- Keep borders subtle, blur treatments soft, and glow effects restrained.

## Layout Guidance
- Global background systems in `src/App.tsx` are part of the product language and should generally be preserved.
- Authenticated pages use `src/components/layout/MainLayout.tsx` with a fixed sidebar, sticky top header, and padded main content area.
- Public pages such as `src/pages/Home.tsx` can be more cinematic and marketing-driven.
- Dashboard and analysis pages should prioritize readability, hierarchy, and structured scanning.

## Motion Guidance
- Preserve framer-motion based entrances, hover lift, route transitions, and reveal behaviors unless there is a strong product reason to simplify.
- Motion should help orientation and hierarchy, not feel ornamental or noisy.

## Implementation Preferences
- Prefer updating existing patterns and components before introducing new visual systems.
- Match existing dark glassmorphism patterns such as `glass-card` and `glass-button` where appropriate.
- Keep desktop-first analytical layouts strong, while ensuring mobile collapse behavior still works.
- Avoid replacing the current look with plain white layouts, default Tailwind aesthetics, pastel palettes, or playful consumer-app styling.

## Watchouts
- Do not accidentally normalize authenticated pages back to the blue public theme.
- Do not remove or flatten existing background layers without a clear reason.
- Be careful with copy edits because some files contain garbled Chinese text from prior encoding issues.
