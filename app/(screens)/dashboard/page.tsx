// Screen 6, Dashboard (lane D, PRD F15). Mockup: events list, licence renewals, duty manager certificates, "run it again".
// Calls: api.listEvents() · api.licences()
// "Run it again" = go to /new with the old description prefilled (api.getEvent(oldId).description), no new route needed.
export default function DashboardPage() {
  return <h1 className="p-4 text-2xl font-semibold">Dashboard</h1>;
}
