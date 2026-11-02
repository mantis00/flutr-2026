import { GuideHeader, GuideNote } from "@/components/tenant/guides/guide-step";
import { canReadGuides } from "@/lib/guides-access";

export default async function ImportGuidePage() {
  if (!(await canReadGuides())) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="Importing historical data"
        lead="Bringing shipment records from before Flutr into your institution's history."
      />

      <GuideNote>
        <p>
          <strong>This guide is still being written.</strong> Importing is available today under{" "}
          <strong>Organization → Data</strong> for admins, but the step-by-step walkthrough,
          including the spreadsheet format and how rows are matched to species, is not ready yet.
        </p>
        <p>
          If you need to import historical records before this page is finished, email Nathan at{" "}
          <a className="text-primary underline" href="mailto:mantisnb@iastate.edu">
            mantisnb@iastate.edu
          </a>{" "}
          and he can walk you through it.
        </p>
      </GuideNote>
    </div>
  );
}
