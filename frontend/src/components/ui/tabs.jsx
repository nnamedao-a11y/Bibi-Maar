/**
 * shadcn/ui Tabs — patched to the platform's canonical "black-outline"
 * language. Every page that imports `{ Tabs, TabsList, TabsTrigger, TabsContent }`
 * automatically inherits the new look, no manual refactor required.
 *
 * Design (matches `<SectionTabs>`):
 *   • TabsList:    bg #FAFAFA + 1px #E4E4E7 border, rounded-xl, p-1, gap-1.
 *   • TabsTrigger: rounded-lg, transparent by default, on active gets a
 *                  white background + 1.5px black outline (shadow ring) +
 *                  black text + semibold.
 */
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-start gap-1 p-1 rounded-xl bg-[#FAFAFA] border border-[#E4E4E7] text-[#52525B] max-w-full overflow-x-auto",
      className,
    )}
    style={{ scrollbarWidth: "none" }}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // base
      "inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-lg px-3.5 py-1.5 text-[12.5px] sm:text-[13px] font-medium transition-colors",
      "ring-offset-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10",
      "disabled:pointer-events-none disabled:opacity-50",
      // idle
      "text-[#52525B] hover:text-[#18181B]",
      // active — white bg + black 1.5px outline (rendered as shadow ring)
      "data-[state=active]:bg-white data-[state=active]:text-[#18181B] data-[state=active]:font-semibold",
      "data-[state=active]:shadow-[0_0_0_1.5px_#18181B]",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
