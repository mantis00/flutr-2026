"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Radix points a trigger's aria-controls at content it unmounts while collapsed, leaving a
// dangling id reference. aria-controls isn't required for a disclosure button, so a collapsed
// trigger drops it. Mirrors the open values because Radix doesn't expose its accordion context;
// null means "no mirror", so parts composed outside this wrapper keep Radix's own behaviour.
const AccordionOpenContext = React.createContext<string[] | null>(null);
const AccordionItemContext = React.createContext<string | null>(null);

function toOpenValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function Accordion({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    toOpenValues(props.defaultValue),
  );
  const open = props.value === undefined ? uncontrolledValue : toOpenValues(props.value);

  // Root's props are a single|multiple union, so narrow on `type` rather than widening the
  // handler — Radix hands each branch a different value shape.
  return (
    <AccordionOpenContext.Provider value={open}>
      {props.type === "single" ? (
        <AccordionPrimitive.Root
          {...props}
          data-slot="accordion"
          onValueChange={(next: string) => {
            setUncontrolledValue(toOpenValues(next));
            props.onValueChange?.(next);
          }}
        />
      ) : (
        <AccordionPrimitive.Root
          {...props}
          data-slot="accordion"
          onValueChange={(next: string[]) => {
            setUncontrolledValue(next);
            props.onValueChange?.(next);
          }}
        />
      )}
    </AccordionOpenContext.Provider>
  );
}

function AccordionItem({
  className,
  value,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionItemContext.Provider value={value}>
      <AccordionPrimitive.Item
        data-slot="accordion-item"
        value={value}
        className={cn("border-b last:border-b-0", className)}
        {...props}
      />
    </AccordionItemContext.Provider>
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  const open = React.useContext(AccordionOpenContext);
  const itemValue = React.useContext(AccordionItemContext);
  const contentUnmounted = open !== null && itemValue !== null && !open.includes(itemValue);

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
        {...(contentUnmounted ? { "aria-controls": undefined } : {})}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
