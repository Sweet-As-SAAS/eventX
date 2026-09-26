import { EventTopBar } from "@/components/event-steps";

export default async function EventLayout({ children, params }: LayoutProps<"/events/[id]">) {
  const { id } = await params;
  return (
    <>
      <EventTopBar id={id} />
      <div className="max-w-[1200px] px-4 py-8 sm:px-10 sm:py-9">{children}</div>
    </>
  );
}
