"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { sanitizedNonEmpty } from "@/lib/validation/sanitize";
import { supplierWebsiteSchema } from "@/lib/validation/suppliers";

import { normalizePlatformSupplier, type PlatformSupplierRecord } from "./suppliers.utils";

const supplierFormSchema = z.object({
  name: sanitizedNonEmpty(200),
  code: sanitizedNonEmpty(50),
  country: sanitizedNonEmpty(100),
  website_url: supplierWebsiteSchema.or(z.literal("")),
  is_active: z.boolean(),
});

type SupplierFormInput = z.input<typeof supplierFormSchema>;
type SupplierFormOutput = z.output<typeof supplierFormSchema>;

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: PlatformSupplierRecord | null;
  onSaved: (supplier: PlatformSupplierRecord, mode: "create" | "edit") => void;
}

const defaultValues: SupplierFormInput = {
  name: "",
  code: "",
  country: "",
  website_url: "",
  is_active: true,
};

export default function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: SupplierFormDialogProps) {
  const isEdit = supplier !== null;

  const form = useForm<SupplierFormInput, undefined, SupplierFormOutput>({
    resolver: zodResolver(supplierFormSchema),
    mode: "onBlur",
    defaultValues,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(
      supplier
        ? {
            name: supplier.name,
            code: supplier.code,
            country: supplier.country,
            website_url: supplier.websiteUrl ?? "",
            is_active: supplier.isActive,
          }
        : defaultValues,
    );
  }, [form, open, supplier]);

  async function onSubmit(values: SupplierFormOutput) {
    const payload: {
      name: string;
      code: string;
      country: string;
      website_url?: string | null;
      is_active: boolean;
    } = {
      name: values.name,
      code: values.code,
      country: values.country,
      is_active: values.is_active,
    };

    if (values.website_url) {
      payload.website_url = values.website_url;
    } else if (isEdit) {
      payload.website_url = null;
    }

    const endpoint = isEdit ? `/api/platform/suppliers/${supplier.id}` : "/api/platform/suppliers";

    const response = await fetch(endpoint, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as ApiErrorResponse;

      if (response.status === 409) {
        form.setError("code", {
          message: "Supplier code already exists or is referenced by shipments.",
        });
        return;
      }

      toast.error(
        errorBody.error?.message ?? `Unable to ${isEdit ? "update" : "create"} supplier.`,
      );
      return;
    }

    const data = (await response.json()) as {
      supplier: {
        id: number;
        name: string;
        code: string;
        country: string;
        websiteUrl: string | null;
        isActive: boolean;
        createdAt: string;
      };
    };

    onSaved(normalizePlatformSupplier(data.supplier), isEdit ? "edit" : "create");
    toast.success(isEdit ? "Supplier updated." : "Supplier created.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this global supplier record."
              : "Create a supplier record available across the platform."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier name</FormLabel>
                    <FormControl>
                      <Input placeholder="Costa Rica Butterflies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier code</FormLabel>
                    <FormControl>
                      <Input placeholder="CRB" {...field} />
                    </FormControl>
                    <FormDescription>Used in shipment imports and records.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Costa Rica" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="border-border flex items-center justify-between gap-4 rounded-md border p-4">
                  <div className="space-y-1">
                    <FormLabel>Active supplier</FormLabel>
                    <FormDescription>
                      Active suppliers appear first and remain available for shipment workflows.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save changes"
                    : "Create supplier"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
