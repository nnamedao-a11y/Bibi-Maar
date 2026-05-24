{
  "design_system_name": "BIBI Admin Edit-Modals (V3.2) — No-Truncation Layout Spec",
  "brand_attributes": [
    "dense-but-readable operations UI",
    "predictable layout across all /admin/* modals",
    "zero truncation for selected labels and control text",
    "desktop-first productivity, mobile-safe stacking"
  ],
  "non_negotiables": {
    "colors": {
      "overlay": "rgba(0,0,0,0.5)",
      "surface": "#FFFFFF",
      "border": "#E4E4E7",
      "text": "#18181B",
      "primary_black": "#18181B",
      "primary_finance_violet": "#635BFF",
      "accent_selected": "#4F46E5",
      "success_toggle": "#059669",
      "error": "#EF4444",
      "note": "No new colors. Use existing tokens only."
    },
    "components": {
      "select": "Must use /app/frontend/src/components/ui/WhiteSelect.jsx everywhere",
      "inputs": "Keep existing pill input look (Input helper OR inline input.px-3 py-2.5 border border-[#E4E4E7] rounded-xl)",
      "modal_shell": "Keep existing motion overlay + motion panel; only standardize inner layout",
      "no_truncation": "No ellipsis anywhere inside edit modals. If it doesn't fit, wrap/stack."
    },
    "responsive_constraints": {
      "no_3col_below_1024": "Never use 3-column UA/EN/BG grids below lg (1024px).",
      "min_cell_width": "Auto-collapse before any control cell drops below ~220px (WhiteSelect trigger truncation threshold)."
    },
    "testing": {
      "data_testid": "All interactive + key informational elements MUST include data-testid (kebab-case, role-based)."
    }
  },
  "component_path": {
    "white_select": "/app/frontend/src/components/ui/WhiteSelect.jsx",
    "shadcn_primitives_available": "/app/frontend/src/components/ui/* (button, input, textarea, label, separator, switch, scroll-area, dialog etc.)",
    "note": "Project uses .js/.jsx; guidelines below assume JSX components."
  },
  "admin_edit_modal_layout_spec": {
    "modal_width_tiers": {
      "tier_s": {
        "use_for": ["ScoreRuleFormModal", "RoutingRuleFormModal (simple variants)", "provider edit mini-forms"],
        "panel_class": "w-[calc(100vw-24px)] sm:w-full max-w-xl"
      },
      "tier_m": {
        "use_for": ["RoutingRuleFormModal (with multiple condition blocks)", "Integrations provider forms with many fields"],
        "panel_class": "w-[calc(100vw-24px)] sm:w-full max-w-2xl"
      },
      "tier_l": {
        "use_for": ["ServiceEditor (multilingual + workflow list)", "any modal with reorderable lists"],
        "panel_class": "w-[calc(100vw-24px)] sm:w-full max-w-3xl"
      },
      "tier_xl": {
        "use_for": ["Only if workflow + multilingual + extra side panels cannot fit"],
        "panel_class": "w-[calc(100vw-24px)] sm:w-full max-w-4xl",
        "rule": "Prefer improving internal grid collapse before increasing beyond max-w-3xl."
      }
    },
    "panel_container": {
      "outer_panel_class": "bg-white rounded-2xl border border-[#E4E4E7] shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
      "height_class": "max-h-[90vh]",
      "layout_class": "grid grid-rows-[auto_minmax(0,1fr)_auto]",
      "note": "This 3-row grid is the core pattern: sticky header, scroll body, sticky footer."
    },
    "sticky_header": {
      "wrapper_class": "sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-[#E4E4E7]",
      "inner_class": "px-4 sm:px-6 py-4 flex items-start gap-3",
      "title_block": {
        "title_class": "text-base sm:text-lg font-semibold text-[#18181B] leading-6",
        "subtitle_class": "mt-0.5 text-sm text-zinc-500 leading-5",
        "rule": "Keep titles short; put long context into subtitle so header doesn't wrap excessively."
      },
      "close_button": {
        "button_class": "ml-auto shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] hover:bg-zinc-50 transition-colors",
        "icon_rule": "Use lucide-react X icon; no emoji.",
        "data_testid": "admin-edit-modal-close-button"
      }
    },
    "scroll_body": {
      "wrapper_class": "min-h-0 overflow-y-auto px-4 sm:px-6 py-5",
      "content_stack": "space-y-6",
      "section_card_optional": {
        "use_when": "Form is long (ServiceEditor) or has repeated blocks (Conditions)",
        "class": "rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5"
      }
    },
    "section_pattern": {
      "section_header": {
        "class": "flex items-center justify-between gap-3",
        "title_class": "text-sm font-semibold text-[#18181B]",
        "hint_class": "text-xs text-zinc-500"
      },
      "divider": {
        "class": "mt-3 border-t border-[#E4E4E7]"
      },
      "section_body_spacing": {
        "class": "mt-4 space-y-4"
      }
    },
    "field_block": {
      "label_class": "block text-sm font-medium text-[#18181B]",
      "label_row": "flex items-center justify-between gap-3",
      "help_text_class": "mt-1 text-xs text-zinc-500 leading-5",
      "control_spacing": "mt-2",
      "error_text_class": "mt-1 text-xs text-[#EF4444]",
      "required_badge": "text-xs text-zinc-500"
    },
    "grid_rules": {
      "global_rule": "All grid children that contain inputs/selects MUST include min-w-0 so wrapping works and controls can size correctly.",
      "single": {
        "class": "grid grid-cols-1 gap-4"
      },
      "pair_short_fields": {
        "class": "grid grid-cols-1 md:grid-cols-2 gap-4",
        "use_for": ["Code + Active", "Priority + Active", "Score Type + Points"],
        "rule": "If either field contains WhiteSelect, prefer md:grid-cols-1 lg:grid-cols-2 OR use minmax grid below."
      },
      "minmax_auto_collapse": {
        "class": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]",
        "why": "Auto-collapses before any cell drops below 220px, preventing WhiteSelect truncation."
      },
      "triplet_multilang": {
        "rule": "UA/EN/BG triplets: never 3-col below lg. Use auto-fit minmax so it becomes 1–2 cols naturally.",
        "class": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:[grid-template-columns:repeat(3,minmax(240px,1fr))]",
        "note": "Below lg, auto-fit will render 1–2 columns depending on available width; at lg+ it locks to 3 columns with safe min widths."
      },
      "condition_row_3_controls": {
        "rule": "If 3 inline controls (Field/Operator/Value) don't fit, they MUST wrap to 2 rows or stack. Never shrink to circles or ellipsis.",
        "class": "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]",
        "note": "Use this instead of flex for condition rows."
      }
    },
    "sticky_footer": {
      "wrapper_class": "sticky bottom-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-t border-[#E4E4E7]",
      "inner_class": "px-4 sm:px-6 py-4",
      "button_row": {
        "rule": "Never use flex-col-reverse. On mobile: primary then secondary stacked (same order as reading). On sm+: side-by-side with secondary left, primary right.",
        "class": "grid grid-cols-1 sm:grid-cols-2 gap-3",
        "secondary_button_class": "h-11 w-full rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] font-medium hover:bg-zinc-50 transition-colors",
        "primary_button_class_black": "h-11 w-full rounded-xl bg-[#18181B] text-white font-medium hover:bg-[#27272A] transition-colors",
        "primary_button_class_violet": "h-11 w-full rounded-xl bg-[#635BFF] text-white font-medium hover:bg-[#564FE6] transition-colors",
        "focus_ring": "focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10 focus-visible:ring-offset-0",
        "data_testid_examples": {
          "cancel": "admin-edit-modal-cancel-button",
          "save": "admin-edit-modal-save-button"
        }
      },
      "footer_note": {
        "optional_class": "mt-3 text-xs text-zinc-500",
        "use_for": "Show validation summary or last-saved timestamp (key info must also have data-testid)."
      }
    }
  },
  "white_select_usage_rules": {
    "goal": "WhiteSelect trigger must never truncate selected label (no ellipsis).",
    "do_not": [
      "Do not place WhiteSelect inside a flex row without min-w-0 on siblings",
      "Do not apply truncate / overflow-hidden / whitespace-nowrap to the label container",
      "Do not allow grid columns to shrink below 220px"
    ],
    "container_rules": {
      "preferred_grid": "Use [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] for any row containing WhiteSelect.",
      "grid_child": "Wrap each control in <div className=\"min-w-0\">…</div> so the trigger can compute width correctly.",
      "when_narrow": "If modal width is narrow, stack WhiteSelect on its own row (grid auto-fit will do this)."
    },
    "trigger_class_contract": {
      "apply_to_white_select_trigger": "w-full min-w-0 h-11 px-3 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-left text-sm text-[#18181B]",
      "label_wrap": "whitespace-normal break-words [overflow-wrap:anywhere]",
      "caret_alignment": "flex items-center justify-between gap-2",
      "note": "If WhiteSelect internally renders a label span with truncate, remove it and use wrapping classes above."
    },
    "integration_page_cards": {
      "rule": "Even outside modals (Integrations cards), apply the same minmax grid + trigger wrapping so provider names/labels never ellipsize.",
      "example_row_class": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
    }
  },
  "edit_service_modal_redesign": {
    "modal_tier": "tier_l (max-w-3xl)",
    "layout": {
      "top_level_sections": [
        {
          "id": "service-basics",
          "title": "Basics",
          "grid": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]",
          "fields": ["Code", "Active checkbox"]
        },
        {
          "id": "service-names",
          "title": "Names (UA / EN / BG)",
          "grid": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:[grid-template-columns:repeat(3,minmax(240px,1fr))]",
          "rule": "Below lg this becomes 1–2 columns automatically; never cramped 3-col.",
          "fields": ["Name UA", "Name EN", "Name BG"]
        },
        {
          "id": "service-descriptions",
          "title": "Descriptions (UA / EN / BG)",
          "grid": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:[grid-template-columns:repeat(3,minmax(240px,1fr))]",
          "textarea_rule": "Textareas must have min height and be usable on mobile.",
          "textarea_class": "min-h-[120px] resize-y",
          "fields": ["Description UA", "Description EN", "Description BG"]
        },
        {
          "id": "service-pricing",
          "title": "Pricing",
          "grid": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]",
          "fields": ["Category (WhiteSelect)", "Base Price", "Currency (WhiteSelect)"],
          "rule": "This grid auto-wraps to 2 rows on narrow widths; prevents tiny circle triggers."
        },
        {
          "id": "service-workflow",
          "title": "Workflow steps",
          "layout": "space-y-3",
          "list_container": "rounded-2xl border border-[#E4E4E7] bg-white",
          "list_header": "px-4 py-3 border-b border-[#E4E4E7] flex items-center justify-between",
          "list_body": "p-3 space-y-2",
          "step_item": "flex items-center gap-3 rounded-xl border border-[#E4E4E7] bg-white px-3 py-2",
          "drag_handle": "shrink-0 h-9 w-9 rounded-lg border border-[#E4E4E7] bg-zinc-50 flex items-center justify-center",
          "step_text": "min-w-0 flex-1",
          "step_title": "text-sm font-medium text-[#18181B] whitespace-normal break-words",
          "step_meta": "text-xs text-zinc-500",
          "actions": "shrink-0 flex items-center gap-2",
          "action_button": "h-9 px-3 rounded-xl border border-[#E4E4E7] bg-white text-sm hover:bg-zinc-50 transition-colors",
          "empty_state": "p-6 text-sm text-zinc-500",
          "data_testid_examples": {
            "list": "service-editor-workflow-steps-list",
            "add_step": "service-editor-add-workflow-step-button",
            "step_item": "service-editor-workflow-step-item"
          }
        }
      ]
    },
    "apply_template_row": {
      "placement": "Inside Basics section footer or as a right-aligned action row above Workflow",
      "class": "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
      "button_class": "h-11 rounded-xl border border-[#E4E4E7] bg-white px-4 text-sm font-medium text-[#18181B] hover:bg-zinc-50 transition-colors",
      "data_testid": "service-editor-apply-template-button"
    }
  },
  "score_rule_modal_specific_notes": {
    "score_type_points_row": {
      "use_grid": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]",
      "why": "Prevents Score Type from truncating (Lead …)."
    },
    "condition_row": {
      "use_grid": "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]",
      "operator_label": "Ensure option labels like 'Exists' are fully visible; allow wrapping in trigger.",
      "value_field": "If operator is Exists/Not exists, hide/disable Value input but keep layout stable (do not collapse widths)."
    }
  },
  "routing_rule_modal_specific_notes": {
    "assignment_block": {
      "rule": "Queue Name OR Destination ID should be a conditional field that occupies full row when visible.",
      "class": "grid grid-cols-1 gap-4"
    },
    "conditions_grid": {
      "class": "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]",
      "note": "Use auto-fit minmax to avoid 4 tiny pills on tablet."
    }
  },
  "micro_interactions_motion": {
    "modal_open_close": {
      "rule": "Keep existing framer-motion; ensure reduced-motion support.",
      "recommended": "Use opacity + translateY(8px) + scale(0.98) on open; reverse on close; duration 160–220ms; ease-out."
    },
    "controls": {
      "hover": "Buttons/select triggers: hover:bg-zinc-50 (secondary) or hover:bg-[#27272A] (primary black).",
      "focus": "Use focus-visible:ring-4 ring-black/10 for all interactive elements.",
      "loading": "Primary Save button: show spinner + disable; keep width stable (no layout shift)."
    }
  },
  "accessibility": {
    "keyboard": [
      "Close button must be reachable and have aria-label",
      "Escape closes modal (existing behavior)",
      "Sticky footer buttons must remain reachable when body scrolls"
    ],
    "labels": [
      "Every input/select must have a visible label",
      "Optional sections should be labeled '(optional)' in hint text"
    ],
    "contrast": "Use existing palette; ensure text-zinc-500 only on white backgrounds."
  },
  "implementation_snippets_jsx": {
    "modal_panel_skeleton": "<motion.div className=\"fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-6\" data-testid=\"admin-edit-modal-overlay\">\n  <motion.div className=\"bg-white rounded-2xl border border-[#E4E4E7] shadow-[0_24px_80px_rgba(0,0,0,0.22)] w-[calc(100vw-24px)] sm:w-full max-w-2xl max-h-[90vh] grid grid-rows-[auto_minmax(0,1fr)_auto]\" data-testid=\"admin-edit-modal-panel\">\n    <div className=\"sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-[#E4E4E7]\">\n      <div className=\"px-4 sm:px-6 py-4 flex items-start gap-3\">\n        <div className=\"min-w-0\">\n          <h2 className=\"text-base sm:text-lg font-semibold text-[#18181B] leading-6\" data-testid=\"admin-edit-modal-title\">Edit …</h2>\n          <p className=\"mt-0.5 text-sm text-zinc-500 leading-5\" data-testid=\"admin-edit-modal-subtitle\">Optional helper text</p>\n        </div>\n        <button type=\"button\" className=\"ml-auto shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] hover:bg-zinc-50 transition-colors\" aria-label=\"Close\" data-testid=\"admin-edit-modal-close-button\">✕</button>\n      </div>\n    </div>\n\n    <form className=\"min-h-0 overflow-y-auto px-4 sm:px-6 py-5\" data-testid=\"admin-edit-modal-form\">\n      <div className=\"space-y-6\">\n        {/* sections */}\n      </div>\n    </form>\n\n    <div className=\"sticky bottom-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-t border-[#E4E4E7]\">\n      <div className=\"px-4 sm:px-6 py-4\">\n        <div className=\"grid grid-cols-1 sm:grid-cols-2 gap-3\">\n          <button type=\"button\" className=\"h-11 w-full rounded-xl border border-[#E4E4E7] bg-white text-[#18181B] font-medium hover:bg-zinc-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10\" data-testid=\"admin-edit-modal-cancel-button\">Cancel</button>\n          <button type=\"submit\" className=\"h-11 w-full rounded-xl bg-[#18181B] text-white font-medium hover:bg-[#27272A] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10\" data-testid=\"admin-edit-modal-save-button\">Save</button>\n        </div>\n      </div>\n    </div>\n  </motion.div>\n</motion.div>",
    "condition_row_grid": "<div className=\"grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]\">\n  <div className=\"min-w-0\">{/* Field WhiteSelect */}</div>\n  <div className=\"min-w-0\">{/* Operator WhiteSelect */}</div>\n  <div className=\"min-w-0\">{/* Value Input */}</div>\n</div>",
    "multilang_triplet_grid": "<div className=\"grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:[grid-template-columns:repeat(3,minmax(240px,1fr))]\">\n  <div className=\"min-w-0\">{/* UA */}</div>\n  <div className=\"min-w-0\">{/* EN */}</div>\n  <div className=\"min-w-0\">{/* BG */}</div>\n</div>"
  },
  "image_urls": {
    "note": "No new imagery required; this is an internal admin modal pattern redesign.",
    "categories": []
  },
  "instructions_to_main_agent": [
    "Standardize all admin edit modals to the 3-row grid panel: header (sticky) / body (scroll) / footer (sticky).",
    "Replace any flex-based multi-control rows (especially condition rows) with CSS grid using auto-fit + minmax(220px, 1fr).",
    "For UA/EN/BG triplets: use auto-fit minmax with lg-only 3-col lock; never 3-col below 1024px.",
    "Ensure every grid child wrapper uses className=\"min-w-0\".",
    "Update WhiteSelect trigger/label styling to allow wrapping (whitespace-normal + break-words + overflow-wrap:anywhere) and remove any truncate/ellipsis styles.",
    "Fix modal footer buttons: use grid grid-cols-1 sm:grid-cols-2; Cancel left, Save right on sm+; on mobile stack in natural order (Cancel then Save OR Save then Cancel consistently—recommended Cancel first, Save second for submit proximity). Do NOT use flex-col-reverse.",
    "Add data-testid attributes to: overlay, panel, title, close, form, each field input/select, each condition row control, and footer buttons."
  ],
  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>\n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
