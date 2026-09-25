import { redirect } from "next/navigation";

// Reminder emails and the dashboard link to /events/:id. The event opens on its profile.
export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  redirect(`/events/${(await params).id}/profile`);
}
