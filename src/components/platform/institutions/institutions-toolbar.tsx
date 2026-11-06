"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
}

export default function InstitutionsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          aria-label="Search institutions"
          placeholder="Search by name, email, or location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status filter tabs */}
      <ToggleGroup
        type="single"
        value={statusFilter}
        onValueChange={(val) => {
          if (val) onStatusChange(val);
        }}
        aria-label="Filter by status"
        variant="outline"
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="LIVE">Public site live</ToggleGroupItem>
        <ToggleGroupItem value="HIDDEN">Public site hidden</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
