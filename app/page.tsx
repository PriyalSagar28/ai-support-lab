import { redirect } from "next/navigation";

// The Support Workspace is the product; "/" just sends people there.
export default function HomePage() {
  redirect("/pipeline");
}
