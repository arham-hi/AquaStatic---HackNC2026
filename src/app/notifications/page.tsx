import { Page } from "@/components/shell/app-shell";
import { NotificationCenter } from "@/components/notifications/notification-center";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Page title="Notifications" subtitle="Matches, messages, and campus updates that matter to you.">
      <NotificationCenter />
    </Page>
  );
}
