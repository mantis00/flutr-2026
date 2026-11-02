import {
  GuideHeader,
  GuideNote,
  GuideStep,
  GuideSteps,
} from "@/components/tenant/guides/guide-step";

export default function OrganizationGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="Organization & users"
        lead="Your institution's public profile and the people who can sign in to manage it. Open Organization in the sidebar to follow along."
      />

      <GuideSteps>
        <GuideStep
          title="Open Organization"
          shot={{
            src: "/docs/guides/organization-tabs.webp",
            alt: "The Organization page with its tab row annotated",
            caption:
              "The Profile, Users and Data tabs sit under your institution's name. Employees see only Profile, and it is read-only for them.",
          }}
        >
          <p>
            Click <strong>Organization</strong> in the left sidebar. The page is split into three
            tabs: <strong>Profile</strong>, <strong>Users</strong>, and <strong>Data</strong>.
          </p>
          <p>
            Employees see only the Profile tab, and cannot change anything on it. Admins can edit
            every tab.
          </p>
        </GuideStep>

        <GuideStep
          title="Fill in the profile"
          adminOnly
          shot={{
            src: "/docs/field-guide/identity-header.webp",
            alt: "The public homepage hero with the main header and description annotated",
            caption:
              "Main header and Description appear over the hero image on your public homepage.",
          }}
        >
          <p>
            The Profile tab holds everything visitors see: your name, main header and description,
            address, contact details, social links, logo and facility photo, and your theme colour.
          </p>
          <p>
            Each group of fields has an <strong>i</strong> button next to its heading. Click it to
            see exactly where those fields show up on the public site, with an example screenshot.
          </p>
        </GuideStep>

        <GuideStep
          title="Check where a field appears publicly"
          shot={{
            src: "/docs/field-guide/address-contact-page.webp",
            alt: "The public contact page with the institution address annotated",
            caption:
              "Your address fields fill the public contact page and the site footer. There is no separate per-release location.",
          }}
        >
          <p>
            Your address is the one location Flutr stores for your institution. It appears on your
            public contact page and in the site footer.
          </p>
          <GuideNote>
            <p>
              The map on your public statistics page is <strong>not</strong> your location. It shows
              where the species in your exhibit come from in the wild, built from each species&apos;
              recorded range.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep
          title="Add and manage users"
          adminOnly
          shot={{
            src: "/docs/guides/organization-users.webp",
            alt: "The Users tab listing institution users with their roles, with the table and the Add User button annotated",
            caption:
              "The table lists everyone who can sign in to your institution with their role. Add a user with the Add User button above it.",
          }}
        >
          <p>
            Open the <strong>Users</strong> tab to see everyone who can sign in to your institution.
            Click <strong>Add User</strong> to add someone with their name, email, a starting
            password, and a role.
          </p>
          <p>There are two roles you can assign:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Admin</strong> — everything an employee can do, plus managing users, editing
              the organization profile, deleting shipments, and importing or exporting data.
            </li>
            <li>
              <strong>Employee</strong> — can view the dashboard and organization, create shipments,
              record releases, and change butterfly common names and lifespans.
            </li>
          </ul>
          <GuideNote>
            <p>
              You cannot give someone a role higher than your own, or change a user who outranks
              you. You also cannot delete your own account.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep title="The Data tab" adminOnly>
          <p>
            The <strong>Data</strong> tab is where shipment records are exported, and where
            historical records are imported. See the <strong>Importing historical data</strong>{" "}
            guide.
          </p>
        </GuideStep>
      </GuideSteps>
    </div>
  );
}
