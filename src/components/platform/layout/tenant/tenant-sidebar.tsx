"use client";

import TenantNavList from "./tenant-nav-list";

export default function TenantSidebar() {
  return (
    <div className="bg-background hidden min-h-0 w-56 shrink-0 border-r lg:flex lg:flex-col">
      <TenantNavList />
    </div>
  );
}
