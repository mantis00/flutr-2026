"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ROUTES } from "@/lib/routes";

interface NewsEntry {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  is_active: boolean;
  show_on_homepage: boolean;
  created_at: string;
  updated_at: string;
}

const newsFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content must be 10,000 characters or less"),
  image_url: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  is_active: z.boolean(),
});

type NewsFormValues = z.infer<typeof newsFormSchema>;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface NewsFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: NewsEntry | null;
  tenantHeaders: Record<string, string>;
  onSuccess: (entry: NewsEntry) => void;
}

function NewsFormDialog({
  open,
  onOpenChange,
  entry,
  tenantHeaders,
  onSuccess,
}: NewsFormDialogProps) {
  const isEditing = entry !== null;

  const form = useForm<NewsFormValues>({
    resolver: zodResolver(newsFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      title: "",
      content: "",
      image_url: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: entry?.title ?? "",
        content: entry?.content ?? "",
        image_url: entry?.image_url ?? "",
        is_active: entry?.is_active ?? true,
      });
    }
  }, [open, entry, form]);

  async function onSubmit(values: NewsFormValues) {
    const body: Record<string, unknown> = {
      title: values.title,
      content: values.content,
      is_active: values.is_active,
    };
    const trimmedImageUrl = values.image_url?.trim() ?? "";
    if (trimmedImageUrl !== "") {
      body.image_url = trimmedImageUrl;
    } else if (isEditing) {
      body.image_url = null;
    }

    const url = isEditing ? ROUTES.tenant.newsEntryApi(entry!.id) : ROUTES.tenant.newsApi;
    const method = isEditing ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { ...tenantHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.success(isEditing ? "News entry updated." : "News entry created.");
        onSuccess(data.news as NewsEntry);
        onOpenChange(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data?.error?.message ??
            (isEditing ? "Failed to update entry." : "Failed to create entry."),
        );
      }
    } catch {
      toast.error(isEditing ? "Failed to update entry." : "Failed to create entry.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit news entry" : "New news entry"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the title, content, or visibility of this entry."
              : "Add a news entry that will appear on the public home page."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Spring season is here!" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Share an update with visitors…" rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Image URL <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Visible on public site</FormLabel>
                    <FormDescription>
                      When on, this entry appears on the institution home page.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? isEditing
                    ? "Saving…"
                    : "Creating…"
                  : isEditing
                    ? "Save changes"
                    : "Create entry"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function NewsPage() {
  const params = useParams<{ institution: string }>();
  const slug = params?.institution ?? "";

  const [entries, setEntries] = useState<NewsEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NewsEntry | null>(null);

  const tenantHeaders = useMemo(() => ({ "x-tenant-slug": slug }), [slug]);

  const loadEntries = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");
      setErrorMessage(null);
      try {
        const res = await fetch(ROUTES.tenant.newsApi, { headers: tenantHeaders, signal });
        const result = await res.json().catch(() => null);
        if (signal?.aborted) return;
        if (!res.ok) {
          setStatus("error");
          setErrorMessage(result?.error?.message ?? "Failed to load news entries.");
          return;
        }
        setEntries(Array.isArray(result?.news) ? result.news : []);
        setStatus("idle");
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
        setErrorMessage("Failed to load news entries.");
      }
    },
    [tenantHeaders],
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadEntries(ac.signal);
    return () => ac.abort();
  }, [loadEntries]);

  const handleCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const handleEdit = (entry: NewsEntry) => {
    setEditTarget(entry);
    setFormOpen(true);
  };

  const handleFormSuccess = (updated: NewsEntry) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  };

  const handleToggleActive = async (entry: NewsEntry) => {
    setBusyId(entry.id);
    try {
      const res = await fetch(ROUTES.tenant.newsEntryApi(entry.id), {
        method: "PATCH",
        headers: { ...tenantHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !entry.is_active }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        toast.error(result?.error?.message ?? "Failed to update entry.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? (data.news as NewsEntry) : e)));
      toast.success(entry.is_active ? "Entry hidden from public site." : "Entry is now visible.");
    } catch {
      toast.error("Failed to update entry.");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleHomepage = async (entry: NewsEntry) => {
    setBusyId(entry.id);
    try {
      const res = await fetch(ROUTES.tenant.newsEntryApi(entry.id), {
        method: "PATCH",
        headers: { ...tenantHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ show_on_homepage: !entry.show_on_homepage }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        toast.error(result?.error?.message ?? "Failed to update homepage news.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const updated = data.news as NewsEntry;
      setEntries((prev) =>
        prev.map((current) =>
          current.id === updated.id
            ? updated
            : updated.show_on_homepage
              ? { ...current, show_on_homepage: false }
              : current,
        ),
      );
      toast.success(
        updated.show_on_homepage
          ? `${updated.title} will appear on the homepage.`
          : "The newest active entry will appear on the homepage.",
      );
    } catch {
      toast.error("Failed to update homepage news.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (deleteTargetId === null) return;
    const id = deleteTargetId;
    setBusyId(id);
    try {
      const res = await fetch(ROUTES.tenant.newsEntryApi(id), {
        method: "DELETE",
        headers: tenantHeaders,
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        toast.error(result?.error?.message ?? "Unable to delete entry.");
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("News entry deleted.");
    } catch {
      toast.error("Unable to delete entry.");
    } finally {
      setBusyId(null);
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">News</h1>
          <p className="text-muted-foreground">
            Manage news entries that appear on your institution&apos;s public home page.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          New entry
        </Button>
      </div>

      {/* Error */}
      {errorMessage && (
        <div className="text-destructive text-sm" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle>All entries</CardTitle>
          <CardDescription>
            Newest first. Select one active entry to override the homepage news.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <div
              className="text-muted-foreground text-sm"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              Loading entries…
            </div>
          ) : entries.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No news entries yet</EmptyTitle>
                <EmptyDescription>
                  Create your first entry to display news on the public home page.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleCreate}>
                  <Plus className="mr-1.5 size-4" aria-hidden="true" />
                  New entry
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Homepage</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{entry.title}</TableCell>
                      <TableCell>
                        <Badge variant={entry.is_active ? "default" : "outline"}>
                          {entry.is_active ? "Active" : "Hidden"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={entry.show_on_homepage}
                          onCheckedChange={() => void handleToggleHomepage(entry)}
                          disabled={!entry.is_active || busyId !== null}
                          aria-label={`Show ${entry.title} on homepage`}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`More actions for ${entry.title}`}
                              disabled={busyId === entry.id}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleEdit(entry)}>
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleToggleActive(entry)}>
                              {entry.is_active ? "Hide from public site" : "Show on public site"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTargetId(entry.id)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <NewsFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editTarget}
        tenantHeaders={tenantHeaders}
        onSuccess={handleFormSuccess}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this news entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the entry from your institution&apos;s public home page. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
