import { ConversationThread } from "@/components/messages/conversation-thread";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationThread id={id} />;
}
