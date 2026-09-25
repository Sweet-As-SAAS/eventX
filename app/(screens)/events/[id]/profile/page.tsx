// Screen 2, Profile (lane D). Mockup: highlighted phrases, fields tagged stated/inferred/answered,
// up to 3 tap questions, live list of required documents with reasons and source links.
// Calls: api.getEvent(id) on load · api.buildProfile(id) if profile is null · api.answer(id, answers)
//        api.requirements(id) after the profile settles · api.classify(id) for the "likely community" badge
export default async function ProfilePage({ params }: PageProps<"/events/[id]/profile">) {
  const { id } = await params;
  return <h1 className="p-4 text-2xl font-semibold">Profile · {id}</h1>;
}
