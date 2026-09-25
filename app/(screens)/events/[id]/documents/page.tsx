// Screen 3, Documents (lane D). Mockup: pack list with status, draft preview, checklist with red items and "Fix with suggestion".
// Calls: api.listDocuments(id) on load · for each status "pending": api.draft(docId).then(d => api.check(d.id)) in parallel
//        api.fix(docId, itemId) on the Fix button (returns the re-checked document)
// Status "manual" = HostReady does not draft it (official form, site plan screen, food licence). Show it, do not draft it.
export default async function DocumentsPage({ params }: PageProps<"/events/[id]/documents">) {
  const { id } = await params;
  return <h1 className="p-4 text-2xl font-semibold">Documents · {id}</h1>;
}
