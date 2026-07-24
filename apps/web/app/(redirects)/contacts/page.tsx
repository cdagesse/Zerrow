import { redirectToEmailAccountPath } from "@/utils/account";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/contacts", await searchParams);
}
