"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { SpeciesScope } from "./species.utils";

interface TenantSpeciesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  scope: SpeciesScope;
  onScopeChange: (scope: SpeciesScope) => void;
}

export default function TenantSpeciesToolbar({
  search,
  onSearchChange,
  scope,
  onScopeChange,
}: TenantSpeciesToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          aria-label="Search butterfly species"
          placeholder="Search by common name, scientific name, family, or range..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <ToggleGroup
          aria-label="Which species to show"
          type="single"
          variant="outline"
          value={scope}
          onValueChange={(value) => {
            // Radix clears the value when the active item is re-selected.
            if (value === "mine" || value === "all") {
              onScopeChange(value);
            }
          }}
        >
          <ToggleGroupItem value="mine">My species</ToggleGroupItem>
          <ToggleGroupItem value="all">All species</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
