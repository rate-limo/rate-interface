import { redirect } from "next/navigation";

/** The programme lives at `/affiliate`; this keeps the first published address working. */
export default function AffiliatesRedirect() {
  redirect("/affiliate");
}
