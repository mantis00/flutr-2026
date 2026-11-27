"use client";

import { createContext, useContext } from "react";
import type { PublicInstitution } from "@/types/institution";

const InstitutionDataContext = createContext<PublicInstitution | null>(null);

export function useInstitutionData() {
  return useContext(InstitutionDataContext);
}

export function InstitutionDataProvider({
  institution,
  children,
}: {
  institution: PublicInstitution | null;
  children: React.ReactNode;
}) {
  return (
    <InstitutionDataContext.Provider value={institution}>
      {children}
    </InstitutionDataContext.Provider>
  );
}
