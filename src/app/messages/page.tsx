import { Page } from "@/components/shell/app-shell";
import { ConversationList } from "@/components/messages/conversation-list";

export const metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <Page title="Messages" subtitle="Conversations open once both sides accept a match.">
      <ConversationList />
    </Page>
  );
}
