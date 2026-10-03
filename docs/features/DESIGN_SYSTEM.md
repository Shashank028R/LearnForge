# LearnForge Design System Specification

## 1. Visual Philosophy & Design Principles

LearnForge is a serious academic and intellectual workspace intended for prolonged, intense focus sessions. The design system explicitly rejects standard "AI SaaS" visual clichés (neon glows, purple/cyan gradients, floating glass cards, blur backdrops, and faux statistics).

Instead, it draws inspiration from high-craft professional tools like Linear, Notion, GitHub, and modern IDEs:
* **Calm & Low-Distraction**: Surfaces use muted, warm neutrals and crisp 1px borders rather than decorative shadows or floating elements.
* **Information-Dense Without Cramping**: Layout uses a strict 4px/8px rhythm, deliberate hierarchy, and tabular data density.
* **Subtle Elevation**: Depth is established via border contrast, background surface steps, and minimal shadow rather than glassmorphism or thick drop shadows.
* **Intentional Accent Usage**: The brand blue accent (`#4361ee`) is used strictly for interactive affordances (primary buttons, active tabs, focus rings) and never as visual filler.
* **Zero Fake Metrics**: Dashboards and pages only display data backed by actual backend entities. Empty states are authentic onboarding prompts.

---

## 2. Color System & Semantic Tokens

All colors are exposed through CSS custom properties on `:root` and `.dark`, wired into Tailwind as `app.*`, `brand.*`, and `status.*`.

### Neutral Surfaces & Borders
| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| `--color-bg-app` / `app-bg` | `#f8fafc` (slate-50) | `#0f172a` (slate-900) | Full-screen app background |
| `--color-bg-surface` / `app-surface` | `#ffffff` (white) | `#1e293b` (slate-800) | Sidebar, topbar, cards, dialogs |
| `--color-bg-surface-muted` / `app-surface-muted` | `#f1f5f9` (slate-100) | `#334155` (slate-700) | Input backgrounds, code tags, badge backings |
| `--color-bg-surface-hover` / `app-surface-hover` | `#f8fafc` (slate-50) | `#243248` | Interactive row/button hover states |
| `--color-border-default` / `app-border` | `#e2e8f0` (slate-200) | `#334155` (slate-700) | Standard component borders and dividers |
| `--color-border-subtle` / `app-border-subtle` | `#edf2f7` | `#1e293b` | Inner nested dividers |

### Typography Tokens
| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| `--color-text-primary` / `app-text-primary` | `#0f172a` (slate-900) | `#f8fafc` (slate-50) | Primary headers, body text, inputs |
| `--color-text-secondary` / `app-text-secondary` | `#475569` (slate-600) | `#94a3b8` (slate-400) | Descriptions, labels, secondary controls |
| `--color-text-muted` / `app-text-muted` | `#64748b` (slate-500) | `#64748b` (slate-500) | Timestamps, placeholders, shortcuts |

### Brand Palette (Restrained Blue)
* `brand-50`: `#f5f7ff`
* `brand-100`: `#ebf0fe`
* `brand-500`: `#4361ee` (Primary brand action)
* `brand-600`: `#3a56d4` (Hover brand action)
* `brand-700`: `#2b44ab` (Active brand action)

### Status & Feedback Tokens
* `status-success`: `#10b981` (emerald-500)
* `status-warning`: `#f59e0b` (amber-500)
* `status-danger`: `#ef4444` (red-500)

---

## 3. Typography Hierarchy

Font Family: `Inter`, system-ui, -apple-system, sans-serif. Monospace: `JetBrains Mono`, `Menlo`, monospace.

| Style | Classes | Size / Weight | Line Height | Usage |
|---|---|---|---|---|
| **Display** | `.text-display` | 24px (1.5rem) / Bold (700) | 1.2 | Workspace hero headings |
| **Title** | `.text-title` | 18px (1.125rem) / Semibold (600) | 1.3 | Page titles, major dialog titles |
| **Section** | `text-sm font-semibold` | 14px (0.875rem) / Semibold (600) | 1.4 | Card headers, sidebar category labels |
| **Body** | `.text-body` | 14px (0.875rem) / Normal (400) | 1.5 | Primary reading text |
| **Caption** | `.text-caption` | 12px (0.75rem) / Normal (400) | 1.4 | Explanations, empty state text |
| **Label** | `.text-label` | 11px (0.6875rem) / Medium (500) | 1.0 | Uppercase tracking-wider badges & table headers |
| **Monospace**| `font-mono text-xs` | 12px (0.75rem) / Bold/Medium | 1.2 | OTP inputs, version identifiers, keyboard shortcuts |

---

## 4. Spacing, Elevation & Border Radius

### Spacing Rhythm
Standard spacing relies strictly on Tailwind base units (multiples of 4px):
* Micro-gap: `gap-1` (4px), `gap-1.5` (6px), `gap-2` (8px)
* Component padding: `p-2` (8px), `p-3` (12px), `p-4` (16px)
* Card padding: `p-5` (20px), `p-6` (24px)
* Page gutters: `p-4 sm:p-6 lg:p-8`

### Radii Tokens
* `sm`: 4px (Buttons, badges, tags)
* `DEFAULT`: 6px (Inputs, dropdown items, nav links)
* `md`: 8px (Cards, small dialogs)
* `lg`: 10px (Main dialog containers)
* `full`: 9999px (Avatars, status pills)

### Elevation & Shadows
* `shadow-subtle`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)` (Cards, buttons)
* `shadow-modal`: `0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)` (Dialogs, dropdowns)
* *Strict rule*: No 3D floating shadows, neon drop-shadows, or blurred backdrops.

---

## 5. UI Primitives Specification

All primitives reside in `client/src/components/ui/` and export through `index.js`:
* `Button`: Primary, secondary, outline, ghost, danger variants. Supports `loading`, `icon`, `size` (`sm`, `md`, `lg`), `fullWidth`.
* `IconButton`: Accessible button for icon-only triggers with required `aria-label` or `label`.
* `Input`: Accessible form input with label, left/right icon slots, `error`, `helperText`, `aria-invalid`, `aria-describedby`.
* `Dialog`: Accessible modal with overlay backdrop, complete keyboard focus trap (`useFocusTrap`), forward/reverse Tab cycling, Escape key dismiss, focus restoration to opener, unique `useId()` ARIA attribute bindings, and content click-propagation isolation.
* `Dropdown`: Click-outside and keyboard-dismissible popover menu supporting headers, items, icons, badges, and destructive items.
* `EmptyState`: Clean container with icon, title, description, and primary/secondary action triggers.
* `Skeleton`: Accessible shimmer placeholder with text, circular, and rectangular shapes.
* `LoadingState`: Multi-variant loading container (route, card grid, list rows).
* `ErrorState`: Alert-styled failure view with sanitized messages and recovery action.
* `Tabs`: Accessible horizontal tablist with active indicators and item count badges.
* `Divider`: Border separator with optional text label.
* `Avatar`: Circular user identity badge with fallback initials calculation.
* `Badge`: Status tags (neutral, success, warning, danger, brand).
* `Icon`: Cohesive 1.5-stroke vector suite with 24x24 viewBox. Uses `close` as the canonical dismiss identifier across all dialogs, drawers, and modals. Warns in development if an unrecognized name is requested and gracefully falls back to `info`.

---

## 6. Accessibility (A11y) Baseline

1. **Focus Ring**: Uniform 2px focus ring (`ring-2 ring-brand-500 ring-offset-1`) via `*:focus-visible` without default browser outline bleed.
2. **Accessible Names**: All icon-only buttons include descriptive `aria-label`.
3. **Form Controls**: Labels use explicit `htmlFor` matching input `id`; error states set `aria-invalid="true"` and `aria-describedby`.
4. **Modal Focus Management (`useFocusTrap`)**:
   - Initial Focus: Focus automatically shifts into the modal on open (targeting first focusable control).
   - Trapped Tab Loop: Tab key cycles forward; Shift+Tab cycles backwards without leaking focus outside the dialog container.
   - Escape Key: Closes modal cleanly.
   - Focus Restoration: Upon modal close, focus is automatically returned to the triggering element.
5. **Dialog ARIA Semantics**:
   - Implements `role="dialog"` and `aria-modal="true"`.
   - `aria-labelledby` and `aria-describedby` utilize unique generated IDs via React's `useId()` and are omitted when title or description is not provided.
6. **Color Contrast**: All text styles meet WCAG AA contrast (minimum 4.5:1 for normal text, 3:1 for large text).
7. **Semantic HTML**: `<aside>` for sidebar, `<header>` for topbar, `<main>` for workspace, `<nav>` for breadcrumbs and link lists.

---

## 7. Responsive Strategy

* **Desktop (>= 1024px / 768px)**: Persistent 240px (`w-60`) sticky left sidebar, full search bar, multi-column card grids.
* **Tablet (768px - 1023px)**: Responsive content area, responsive card collapse.
* **Mobile (< 768px)**:
  * Persistent sidebar hides completely.
  * Hamburger menu trigger appears in TopBar.
  * Drawer modal slides in over a backdrop on toggle.
  * Inputs and buttons expand to touch-friendly tap targets without horizontal overflow.

---

## 8. Animation & Motion Rules

* **Allowed**:
  * Micro transitions on color/background (`transition-colors duration-150`).
  * Modal fade-in and scale (`transition-all`).
  * Skeleton subtle opacity shimmer (`animate-pulse`).
* **Forbidden**:
  * Bouncing elements.
  * Floating decorative particles.
  * Multi-second entrance animations.
  * Parallax scrolling effects.
