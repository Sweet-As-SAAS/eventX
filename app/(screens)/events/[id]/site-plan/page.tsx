"use client";
import { use } from "react";
import { SitePhoto } from "@/components/site-photo";
import { ButtonLink, Title } from "@/components/ui";

// Screen 4, Site plan (PRD F10). The organiser's own site plan picture, with what we'd point out before the council sees it.
export default function SitePlanPage({ params }: PageProps<"/events/[id]/site-plan">) {
  const { id } = use(params);
  return (
    <div className="space-y-8">
      <Title sub="The council wants a detailed site map with your permit. Here's yours, and anything we'd look at again before you send it.">
        Site plan
      </Title>
      <SitePhoto eventId={id} />
      <div className="border-t border-border pt-6">
        <ButtonLink href={`/events/${id}/deadlines`}>Continue to deadlines</ButtonLink>
      </div>
    </div>
  );
}
