import { apiServer } from "@/lib/api-server";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const contacts = await apiServer<unknown[]>("/contacts");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <ContactsClient contacts={contacts as never} />
    </div>
  );
}
