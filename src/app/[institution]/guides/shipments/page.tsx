import {
  GuideHeader,
  GuideNote,
  GuideStep,
  GuideSteps,
} from "@/components/tenant/guides/guide-step";
import { canReadGuides } from "@/lib/guides-access";

export default async function ShipmentsGuidePage({
  params,
}: {
  params: Promise<{ institution: string }>;
}) {
  const { institution } = await params;
  if (!(await canReadGuides(institution))) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="Shipments"
        lead="A shipment is one delivery of pupae from a supplier. Recording it is the first step — releases are built on top of it."
      />

      <GuideSteps>
        <GuideStep
          title="Start a new shipment"
          shot={{
            src: "/docs/guides/shipments-list.webp",
            alt: "The shipments list with the Add shipment button annotated",
            caption:
              "Start a new shipment: Add shipment sits in the top right. Shipments are listed newest first, with a remaining count and an Add release button on each row.",
          }}
        >
          <p>
            Click <strong>Shipments</strong> in the sidebar, then <strong>Add shipment</strong> in
            the top right.
          </p>
        </GuideStep>

        <GuideStep
          title="Enter the supplier and dates"
          shot={{
            src: "/docs/guides/shipments-details.webp",
            alt: "The Shipment details card with the Supplier and Shipment date fields annotated",
            caption:
              "Shipment details: pick a Supplier, set the Shipment date it was sent, and the Arrival date it reached you.",
          }}
        >
          <p>
            Under <strong>Shipment details</strong>, choose the <strong>Supplier</strong>, then set
            the <strong>Shipment date</strong> (when it was sent) and the{" "}
            <strong>Arrival date</strong> (when it reached you). Arrival date defaults to today.
          </p>
          <GuideNote>
            <p>
              <strong>Supplier missing from the list?</strong> Suppliers are managed centrally, so
              you can&apos;t add one yourself. Email Nathan at{" "}
              <a className="text-primary underline" href="mailto:mantisnb@iastate.edu">
                mantisnb@iastate.edu
              </a>{" "}
              with the supplier&apos;s name, code and country and he&apos;ll add it.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep
          title="Add the species that arrived"
          shot={{
            src: "/docs/guides/shipments-species-picker.webp",
            alt: "The Add butterflies dialog with the search box and a species row annotated",
            caption:
              "Search the catalog, then click to select. Pick as many species as the shipment contained and confirm with Add selected.",
          }}
        >
          <p>
            Click <strong>Add butterflies</strong>. Search the catalog, select every species in the
            shipment, then click <strong>Add selected</strong>. You can sort and filter the list to
            find a species faster.
          </p>
          <GuideNote>
            <p>
              <strong>Species missing from the catalog?</strong> The species list is shared across
              all institutions, so you can&apos;t add to it yourself. Email Nathan at{" "}
              <a className="text-primary underline" href="mailto:mantisnb@iastate.edu">
                mantisnb@iastate.edu
              </a>{" "}
              with the scientific name and he&apos;ll add it.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep
          title="Record quantities and losses"
          shot={{
            src: "/docs/guides/shipments-items-table.webp",
            alt: "A species card on the add-shipment form with the Received counter and the Damaged counter annotated",
            caption:
              "How many arrived goes in Received. After that there is one box per kind of loss: Emerged, Damaged, Diseased, Parasite, Non-emerg and Poor-emerg.",
          }}
        >
          <p>
            Each species you picked gets its own card with a row of counters. Use the{" "}
            <strong>+</strong> and <strong>−</strong> buttons, or type straight into a box.
          </p>
          <p>
            Put the total that arrived in <strong>Received</strong>. The remaining boxes are the
            ways butterflies can be lost: <strong>Emerged</strong> (emerged in transit),{" "}
            <strong>Damaged</strong>, <strong>Diseased</strong>, <strong>Parasite</strong>,{" "}
            <strong>Non-emerg</strong> and <strong>Poor-emerg</strong>.
          </p>
          <p>
            Leave a loss box at zero if it doesn&apos;t apply. Click <strong>Save shipment</strong>{" "}
            when the whole delivery is entered.
          </p>
          <p>
            When <strong>Parasite</strong> is greater than zero, you can optionally enter how many
            were caused by wasps and flies. If you enter either count, the remaining parasitized
            butterflies are shown as <strong>Other</strong>. Leave both blank to skip the breakdown.
            Open <strong>Add parasite details</strong> to enter the counts or add an optional
            species-specific description.
          </p>
        </GuideStep>

        <GuideStep
          title="Edit a shipment afterwards"
          shot={{
            src: "/docs/guides/shipments-force-edit.webp",
            alt: "The Edit shipment items confirmation dialog warning that editing bypasses release tracking",
            caption:
              "Read before you edit: the confirmation warns that editing bypasses release tracking, and that reductions below already-released quantities are rejected.",
          }}
        >
          <p>
            Open a shipment from the list to see its totals (Status, Received, Losses, Released),
            its species table, and its release history. On the detail page the same figures appear
            as a table, with two extra columns Flutr works out for you: <strong>Released</strong>{" "}
            and <strong>Remaining</strong>.
          </p>
          <p>
            Click <strong>Edit items</strong> to correct the numbers. If the shipment already has
            releases recorded against it, Flutr asks you to confirm first. That edit{" "}
            <strong>bypasses release tracking</strong> — use it only to fix data entry mistakes. Any
            reduction below a quantity you have already released is rejected.
          </p>
          <GuideNote>
            <p>
              <strong>Editing a shipment does not change your public counts.</strong> The numbers on
              your public gallery and statistics pages come from <em>releases</em>, not from
              shipment records. Correcting a shipment fixes your internal history; it will not move
              the butterfly count visitors see. Only recording or editing a release does that.
            </p>
          </GuideNote>
        </GuideStep>
      </GuideSteps>
    </div>
  );
}
