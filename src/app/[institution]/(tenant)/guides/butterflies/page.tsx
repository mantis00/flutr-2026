import {
  GuideHeader,
  GuideNote,
  GuideStep,
  GuideSteps,
} from "@/components/tenant/guides/guide-step";

export default function ButterfliesGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="Butterflies"
        lead="The species catalog is shared by every institution. This page is where you override it with what you call a species and how long it actually lives for you."
      />

      <GuideSteps>
        <GuideStep
          title="Find a species"
          shot={{
            src: "/docs/guides/butterflies-list.webp",
            alt: "The Butterflies page listing species, with the search box and the My species toggle annotated",
            caption:
              "Search your species by name, family or range. My species shows only what you have received; All species shows the whole shared catalog.",
          }}
        >
          <p>
            Click <strong>Butterflies</strong> in the sidebar. <strong>My species</strong> lists
            every species your institution has received in a shipment — switch to{" "}
            <strong>All species</strong> to see the whole shared catalog.
          </p>
          <p>
            The list shows each species&apos; scientific name, the common name in use, its lifespan,
            and whether you have customised it.
          </p>
        </GuideStep>

        <GuideStep
          title="Set your own common name"
          shot={{
            src: "/docs/guides/butterflies-edit-dialog.webp",
            alt: "The species edit dialog with the common name and lifespan fields annotated",
            caption:
              "Your common name and Lifespan in days override the shared catalog for your institution only. Each field shows the shared catalog value underneath, and a Reset button to go back to it.",
          }}
        >
          <p>
            Click <strong>Edit</strong> on a species row to open its editor.{" "}
            <strong>Common name</strong> replaces the catalog name everywhere on your public site —
            your gallery, species pages and statistics.
          </p>
          <p>
            Leave a field empty, or press <strong>Reset</strong>, to go back to the shared catalog
            value. That value is printed under each field so you can see what you are overriding.
          </p>
        </GuideStep>

        <GuideStep title="Set the lifespan you actually observe">
          <p>
            <strong>Lifespan (days)</strong> is how long you expect that species to live in your
            exhibit. Set it from your own experience — conditions differ between institutions.
          </p>
          <GuideNote>
            <p>
              Lifespan is not just a label. A released butterfly counts toward your public in-flight
              total until its lifespan has elapsed since the release date, then drops off
              automatically.
            </p>
            <p>
              Shortening a lifespan lowers your public counts; lengthening it raises them. Change it
              when the number on your public page doesn&apos;t match what you see in the exhibit.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep title="Who can change this">
          <p>
            Both Admins and Employees can edit common names and lifespans. Changes apply to your
            institution only — other institutions keep their own values and the shared catalog is
            untouched.
          </p>
        </GuideStep>
      </GuideSteps>
    </div>
  );
}
