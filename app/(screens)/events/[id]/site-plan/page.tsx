// Screen 4, Site plan (lane D, PRD F10, P1). Mockup: SVG from the profile, draggable elements (pointer events),
// live checks for licensed area, exits, first aid and assembly point. Pure client-side, no API route needed.
// Calls: api.getEvent(id) for the profile (marquees, inflatables, alcohol area, food stalls).
export default async function SitePlanPage({ params }: PageProps<"/events/[id]/site-plan">) {
  const { id } = await params;
  return <h1 className="p-4 text-2xl font-semibold">Site plan · {id}</h1>;
}
