"use client";

import * as React from "react";
import type { Label as LabelPrimitive } from "radix-ui";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id, hasDescription, setHasDescription, hasMessage, setHasMessage } = itemContext;

  return {
    id,
    hasDescription,
    setHasDescription,
    hasMessage,
    setHasMessage,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
  hasDescription: boolean;
  setHasDescription: (has: boolean) => void;
  hasMessage: boolean;
  setHasMessage: (has: boolean) => void;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  // FormDescription and FormMessage are both optional (and FormMessage renders nothing without
  // a body), so FormControl can only point aria-describedby at whichever has actually rendered —
  // otherwise the reference dangles (WCAG 4.1.2). One of each per item: they share the item's id,
  // so a second copy would both collide and flip the flag back on unmount.
  const [hasDescription, setHasDescription] = React.useState(false);
  const [hasMessage, setHasMessage] = React.useState(false);
  const value = React.useMemo(
    () => ({ id, hasDescription, setHasDescription, hasMessage, setHasMessage }),
    [id, hasDescription, hasMessage],
  );

  return (
    <FormItemContext.Provider value={value}>
      <div data-slot="form-item" className={cn("grid gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId, hasDescription, hasMessage } =
    useFormField();
  const describedBy =
    [hasDescription && formDescriptionId, hasMessage && formMessageId].filter(Boolean).join(" ") ||
    undefined;

  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={describedBy}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId, setHasDescription } = useFormField();

  React.useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId, setHasMessage } = useFormField();
  const body = error ? String(error?.message ?? "") : props.children;
  const hasBody = !!body;

  React.useEffect(() => {
    setHasMessage(hasBody);
    return () => setHasMessage(false);
  }, [hasBody, setHasMessage]);

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
