// Screen 5, Deadlines and publish (lane D). Mockup: working-day timeline incl. the 20 Dec to 15 Jan liquor period,
// reminder email, PDF export, Eventbrite card locked until every document is ready or manual.
// Calls: api.deadlines(id) · <a href={api.exportUrl(id)} download> · api.listDocuments(id) to decide the lock
//        api.eventbrite(id) (409 while locked) · api.demoReminder() for the live "email lands" moment
export default async function DeadlinesPage({ params }: PageProps<"/events/[id]/deadlines">) {
  const { id } = await params;
  return <h1 className="p-4 text-2xl font-semibold">Deadlines and publish · {id}</h1>;
}
