import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav aria-label="Primary">
        <Link href="/" className="brand">
          Chaupal Seals
        </Link>
        <Link href="/groups">Groups</Link>
        <Link href="/steward">Steward</Link>
        <Link href="/claim">Claim</Link>
      </nav>
    </header>
  );
}
