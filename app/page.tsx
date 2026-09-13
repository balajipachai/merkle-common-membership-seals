import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <h1>A seal of belonging for every Chaupal group</h1>
      <p className="lede">
        Twelve independent community groups, one shared space - without a single administrator,
        and without any group&apos;s member list ever leaving its own steward&apos;s hands.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol>
          <li>A group&apos;s steward keeps its member list locally, as a CSV on their own machine.</li>
          <li>
            The steward publishes only a <strong>fingerprint</strong> of that list - a Merkle
            root - to a shared contract. The names, phone numbers and notes never leave their
            device.
          </li>
          <li>
            A member proves they are on the list and receives a <strong>soulbound seal</strong>: a
            token that stays with them and can never be transferred, sold, or taken.
          </li>
          <li>Chaupal (or anyone) can check whether an address holds a seal for a given group.</li>
        </ol>
      </div>

      <div className="row">
        <Link className="btn" href="/groups">
          Browse groups
        </Link>
        <Link className="btn secondary" href="/steward">
          I&apos;m a steward
        </Link>
        <Link className="btn secondary" href="/claim">
          I have a claim link
        </Link>
      </div>
    </main>
  );
}
