import {
  GuideHeader,
  GuideNote,
  GuideStep,
  GuideSteps,
} from "@/components/tenant/guides/guide-step";

export default function ReleasesGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="Butterfly releases"
        lead="A release records butterflies going from a shipment into your exhibit. This is what drives every number on your public pages."
      />

      <GuideSteps>
        <GuideStep
          title="Open the shipment you are releasing from"
          shot={{
            src: "/docs/guides/releases-entry.webp",
            alt: "A shipment detail page with the Add release button annotated",
            caption:
              "Start a release: Add release sits at the top of the shipment, next to Edit items and Delete.",
          }}
        >
          <p>
            Go to <strong>Shipments</strong> and open the shipment the butterflies came from, then
            click <strong>Add release</strong>. There is also an <strong>Add release</strong> button
            on each row of the shipments list if you already know which one you want.
          </p>
          <p>
            Releases always belong to a shipment — that is how Flutr knows which species and how
            many are still available.
          </p>
        </GuideStep>

        <GuideStep
          title="Sort the butterflies into categories"
          shot={{
            src: "/docs/guides/releases-composer.webp",
            alt: "The Sort the butterflies composer with the Emergence and Other tabs, a per-species allocation cap, and the Save release button annotated",
            caption:
              "Emergence or Other picks which counters you are filling in. Each species shows how many are left to release, and Save when the counts are right sits in the bar at the bottom.",
          }}
        >
          <p>
            The composer has two tabs. <strong>Emergence</strong> holds{" "}
            <strong>Good emergence</strong> and <strong>Poor emergence</strong>;{" "}
            <strong>Other</strong> holds <strong>Diseased</strong>, <strong>Parasite</strong> and{" "}
            <strong>No emergence</strong>.
          </p>
          <p>
            Only <strong>Good emergence</strong> is released into the exhibit. The other four are
            recorded as losses against the shipment.
          </p>
          <p>
            Each species shows <strong>Allocated 0 / 15</strong> — the number on the right is how
            many that shipment has left, and you cannot go past it. The running total and the{" "}
            <strong>Save release</strong> button stay pinned to the bottom of the page.
          </p>
        </GuideStep>

        <GuideStep title="Save the release">
          <p>
            Click <strong>Save release</strong>. Flutr records today&apos;s date as the release date
            and your name as the person who released them — there is nothing extra to fill in.
          </p>
        </GuideStep>

        <GuideStep
          title="Edit a release you already saved"
          shot={{
            src: "/docs/guides/releases-history.webp",
            alt: "The release history table on a shipment, showing release date, released by, released and losses",
            caption:
              "Every release on this shipment is listed with its date, who recorded it, and its released and loss totals.",
          }}
        >
          <p>
            Every release appears in the <strong>release history</strong> on its shipment. Click{" "}
            <strong>Edit</strong> on a release to change the quantities. Editing adjusts the
            shipment&apos;s totals by the difference, so your history stays consistent.
          </p>
        </GuideStep>

        <GuideStep
          title="What visitors see"
          shot={{
            src: "/docs/guides/releases-public-gallery.webp",
            alt: "The public species gallery listing the institution's butterflies",
            caption:
              "The public gallery and statistics pages are calculated from your releases — nothing here is typed in by hand.",
          }}
        >
          <p>
            Your public gallery, homepage and statistics page are all calculated from releases. No
            one types these numbers in:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Species on display</strong> — the species you have released that are still
              flying.
            </li>
            <li>
              <strong>In-flight count</strong> — how many butterflies of each species are currently
              in the exhibit.
            </li>
            <li>
              <strong>Totals released</strong> — accumulated from every release you record.
            </li>
          </ul>
          <GuideNote>
            <p>
              Butterflies leave the in-flight count on their own. A release stops counting once its
              species&apos; lifespan has passed since the release date — so the public number falls
              without you doing anything. Adjust a species&apos; lifespan on the{" "}
              <strong>Butterflies</strong> page if it doesn&apos;t match what you observe.
            </p>
            <p>
              The map on the statistics page shows where your species come from in the wild, not
              where your institution is.
            </p>
          </GuideNote>
        </GuideStep>
      </GuideSteps>
    </div>
  );
}
