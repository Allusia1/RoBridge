import type { Metadata } from "next";
import { DocsChrome } from "@/components/DocsChrome";

export const metadata: Metadata = {
  title: "Docs",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsChrome>{children}</DocsChrome>;
}
