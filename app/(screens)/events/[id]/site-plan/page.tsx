"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { EventDetail, SiteLayout } from "@/lib/schemas";
import { SitePlan } from "@/components/site-plan";
import { SitePhoto } from "@/components/site-photo";
import { crowdKit } from "@/lib/siteplan";
import { useFail } from "@/components/toast";
import { ButtonLink, Skeleton, Title } from "@/components/ui";

// Screen 4, Site plan (PRD F10). The layout comes from the site plan route (built from the profile, plus what was saved).
export default function SitePlanPage({ params }: PageProps<"/events/[id]/site-plan">) {
  const { id } = use(params);
  const fail = useFail();
  // undefined: loading. null: no event details yet (the site plan route would 409).
  const [data, setData] = useState<{ ev: EventDetail; layout: SiteLayout } | null | undefined>(undefined);

  useEffect(() => {
    api.getEvent(id)
      .then(async (ev) => setData(ev.profile ? { ev, layout: await api.sitePlan(id) } : null))
      .catch(fail);
  }, [id, fail]);

  return (
    <div className="space-y-8">
      <Title sub="Everything your event has is already on it. Move things to where they'll be on the day, and the checks update as you go.">
        Site plan
      </Title>
      <SitePhoto eventId={id} />
      {data === undefined && <Skeleton className="aspect-[8/5] w-full lg:w-2/3" />}
      {data === null && (
        <div className="space-y-4">
          <p className="text-lg text-neutral-700">The site plan is built from your event details, and we don&apos;t have them yet.</p>
          <ButtonLink href={`/events/${id}/profile`} variant="secondary">Go to your event</ButtonLink>
        </div>
      )}
      {data?.ev.profile?.peakAttendance.value && (() => {
        const k = crowdKit(data.ev.profile);
        return <p className="-mt-4 text-base text-neutral-700">Sized for about {k.people.toLocaleString("en-NZ")} people: {k.toilets} toilets, {k.bins} bins and {k.firstAid === 1 ? "a first aid post" : `${k.firstAid} first aid posts`}. Toilets and bins are our rule of thumb, not a council rule.</p>;
      })()}
      {data && <SitePlan eventId={id} layout={data.layout} council={data.ev.council} requirements={data.ev.requirements} />}
      <div className="border-t border-border pt-6">
        <ButtonLink href={`/events/${id}/deadlines`}>Continue to deadlines</ButtonLink>
      </div>
    </div>
  );
}
