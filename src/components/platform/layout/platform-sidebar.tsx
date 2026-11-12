"use client";

import PlatformNavList from "./platform-nav-list";

export default function PlatformSidebar() {
  return (
    <div className="bg-background hidden min-h-0 w-56 shrink-0 border-r md:flex md:flex-col">
      <PlatformNavList />
    </div>
  );
}
