import { apiServer } from "@/lib/api-server";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const contacts = await apiServer<unknown[]>("/contacts");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Contatos</h1>
        <p className="text-muted-foreground">
          Leads e contatos com origem de campanha (UTM).
        </p>
      </div>
      <ContactsClient contacts={contacts as never} />
    </div>
  );
}
