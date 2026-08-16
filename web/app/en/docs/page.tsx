import Link from "next/link";

export const metadata = { title: "Docs" };

export default function EnDocsIndex() {
  return (
    <main className="home">
      <p className="kicker">English</p>
      <h1>RoBridge docs</h1>
      <p className="lede">
        Canonical docs: <Link href="/docs">/docs</Link>
      </p>
      <p>
        <Link className="btn btn-primary" href="/docs">
          Open /docs
        </Link>
      </p>
    </main>
  );
}
