import { notFound } from "next/navigation";
import { Navbar } from "@/components/nav/nav";
import { Footer } from "@/components/nav/footer";
import { getPublicInstitution } from "@/lib/queries/institution";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ institution: string }>;
}) {
  const { institution: slug } = await params;

  // Hidden public site (`stats_active = false`) -> 404 for every public route.
  if (!(await getPublicInstitution(slug))) notFound();

  return (
    <>
      <Navbar />
      <main id="main-content" className="flex-1 pb-20 md:pb-6">
        {children}
      </main>
      <Footer />
    </>
  );
}
