import { Resend } from "resend";

export async function sendReminder(to: string, p: { eventName: string; label: string; due: string; link: string }) {
  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    // Without a verified domain Resend only sends from onboarding@resend.dev to your own account email.
    from: process.env.REMINDER_FROM ?? "HostReady <onboarding@resend.dev>",
    to,
    subject: `${p.eventName}: ${p.label} by ${p.due}`,
    text: `Kia ora,\n\n${p.label} for ${p.eventName} is due by ${p.due}.\n\nOpen your pack: ${p.link}\n\nHostReady prepares documents. You review and lodge them.`,
  });
  if (error) throw new Error(`Resend: ${error.message}`); // Resend returns errors instead of throwing
  return data;
}
