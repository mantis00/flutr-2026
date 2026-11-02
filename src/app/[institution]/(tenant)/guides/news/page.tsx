import { GuideHeader, GuideStep, GuideSteps } from "@/components/tenant/guides/guide-step";

export default function NewsGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="News"
        lead="Short updates for visitors — a new season, an event, a temporary closure. They appear on your public homepage."
      />

      <GuideSteps>
        <GuideStep
          title="Create a post"
          shot={{
            src: "/docs/guides/news-dialog.webp",
            alt: "The New news entry dialog with the title, content and visibility fields annotated",
            caption:
              "A news entry has a Title, its Content, an optional image URL, and a toggle that decides whether to show it on the public site.",
          }}
        >
          <p>
            Click <strong>News</strong> in the sidebar, then <strong>New entry</strong>. Give it a{" "}
            <strong>Title</strong> and <strong>Content</strong>. You can add an image URL if you
            have one hosted somewhere.
          </p>
        </GuideStep>

        <GuideStep title="Control whether visitors see it">
          <p>
            <strong>Visible on public site</strong> decides whether the post is live. Turn it off to
            draft a post ahead of time, or to retire one without deleting it.
          </p>
          <p>
            You can flip this later from the list — you don&apos;t have to delete a post to take it
            down.
          </p>
        </GuideStep>

        <GuideStep
          title="See where it appears"
          shot={{
            src: "/docs/guides/news-public.webp",
            alt: "The public homepage with a published news entry annotated",
            caption:
              "Your news post appears part-way down the public homepage, with its image, date and a Show more link for longer posts.",
          }}
        >
          <p>
            Visible entries show up in the news section of your public homepage, newest first. Use{" "}
            <strong>View Public Site</strong> in the header to check how it looks.
          </p>
        </GuideStep>

        <GuideStep title="Edit or delete">
          <p>
            The <strong>All entries</strong> table lists every post, newest first. Use the menu on a
            row to edit or delete it. Deleting is permanent, so hide a post instead if you might
            want it back.
          </p>
        </GuideStep>
      </GuideSteps>
    </div>
  );
}
