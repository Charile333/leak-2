# AI Collaboration Notes

## Project Snapshot
- This is a Vite + React 19 + TypeScript frontend with Tailwind CSS v4 styling and framer-motion driven transitions.
- The product is a cyber threat intelligence / leak monitoring platform. The UI should feel like a security operations product, not a generic SaaS dashboard.
- There are two main visual modes:
  - Public marketing / landing pages with blue brand accent.
  - Authenticated functional pages with a darker purple-leaning accent via `.functional-theme`.

## Design Direction
- Keep the overall tone dark, technical, and high-trust.
- Prefer layered depth over flat surfaces: blurred cards, soft glows, radial gradients, subtle noise, and animated background systems are already part of the product language.
- The visual personality is "cyber intelligence console" rather than "consumer app".
- Blue is the default brand accent. Functional pages intentionally shift to a purple accent through CSS variables. Do not accidentally normalize everything back to one generic color.

## Existing Design Tokens
- Core tokens live in `src/index.css` and `tailwind.config.js`.
- Primary background: `#080C12`
- Card background: `#0F1623`
- Default accent: `#0095d9`
- Functional-page accent override: purple (`#a855f7`, shimmer highlight `#9333ea`)
- Foreground text: white with heavy use of reduced-opacity secondary text

## Layout Patterns
- Global app shell is defined in `src/App.tsx` with multiple persistent background layers:
  - `AbstractLines`
  - `EnhancedBackground`
  - `AdvancedBackground`
- Authenticated pages use `src/components/layout/MainLayout.tsx`:
  - fixed left sidebar
  - sticky top header
  - padded main content area
  - animated route/content transitions
- Public pages such as `src/pages/Home.tsx` are more cinematic and marketing-heavy than internal tool pages.

## Component and Motion Patterns
- framer-motion is a core part of the UI language. Preserve entrance transitions, hover lift, fade/slide reveals, and route transitions unless there is a strong reason to simplify.
- Glassmorphism is used throughout:
  - `glass-card`
  - `glass-button`
  - blurred dark panels with faint borders
- Data-heavy pages use a mix of:
  - large metric cards
  - high-contrast mono-style numbers
  - bordered modules
  - charts with glow-accent styling

## Styling Guidance For Future Edits
- Reuse existing CSS variables and Tailwind color names before inventing new colors.
- Preserve dark backgrounds, subtle borders, and blur treatments.
- Keep accent glow restrained; the design uses atmosphere, not neon overload.
- Prefer rounded-xl to rounded-3xl shapes already present in the codebase.
- On dashboard-style pages, prioritize readability and hierarchy over decorative complexity.
- On landing pages, richer motion and visual storytelling are acceptable.

## UX Expectations
- Desktop experience is important; many layouts are wide and panel-based.
- Mobile support still matters: existing pages frequently use responsive grid collapses and smaller spacing on mobile.
- Sidebar/navigation interactions are animated and should remain smooth.
- Route changes should continue to feel polished and intentional.

## Content and Localization Constraints
- The repo currently contains noticeable garbled Chinese text in several files, likely due to encoding issues.
- When editing copy, preserve intended language and keep file encoding consistent in UTF-8 where possible.
- Avoid bulk text rewrites unless the task explicitly asks for localization or copy cleanup.

## Practical Do / Don't
- Do make new UI match the existing cyber-intelligence visual language.
- Do check whether a page is public-facing or part of the authenticated console before styling it.
- Do preserve existing background systems and motion layers when making localized changes.
- Don't replace the current look with a plain white SaaS layout or default Tailwind aesthetic.
- Don't remove purple functional-page theming from authenticated pages unless the task explicitly requires a rebrand.
- Don't introduce unrelated fonts, bright pastel palettes, or playful consumer-app patterns.

## Key Files To Review Before Major UI Changes
- `src/index.css`
- `tailwind.config.js`
- `src/App.tsx`
- `src/components/layout/MainLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/pages/Home.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Login.tsx`
