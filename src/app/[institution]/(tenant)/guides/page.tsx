import NavCard from "@/components/shared/nav-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GUIDE_ITEMS } from "@/components/tenant/guides/guide-items";
import { ROUTES } from "@/lib/routes";

const FAQS = [
  {
    question: "Why hasn't my shipment changed the counts on the public site?",
    answer:
      "Shipments record what arrived. The public site counts butterflies that are flying in your exhibit, which only changes when you record a release. See the Shipments and Butterfly releases guides.",
  },
  {
    question: "A species or supplier I need isn't in the list. What do I do?",
    answer:
      "Species and suppliers are managed centrally, so you can't add them yourself. Email Nathan at mantisnb@iastate.edu with the scientific name or supplier details and he'll add them.",
  },
  {
    question: "Why did my in-flight count drop without me doing anything?",
    answer:
      "Butterflies leave the public count automatically once their lifespan has elapsed since their release date. You can adjust a species' lifespan on the Butterflies page.",
  },
  {
    question: "Placeholder — more questions to come.",
    answer: "This section will be filled in as questions come in from institution staff.",
  },
];

export default async function GuidesPage({ params }: { params: Promise<{ institution: string }> }) {
  const { institution } = await params;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Guides</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          How to use Flutr, one area at a time. These pages are only visible to people signed in to
          your institution.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GUIDE_ITEMS.map((guide) => (
          <NavCard
            key={guide.slug}
            href={ROUTES.tenant.guideBySlug(institution, guide.slug)}
            title={guide.title}
            description={guide.description}
            icon={guide.icon}
          />
        ))}
      </div>

      <section aria-labelledby="faq-heading" className="mt-12">
        <h2 id="faq-heading" className="text-lg font-semibold">
          Common questions
        </h2>
        <Accordion type="single" collapsible className="mt-2">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
