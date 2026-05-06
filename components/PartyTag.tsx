function partyColor(party: string | null): string {
  switch (party) {
    case "R":
      return "var(--party-republican)";
    case "D":
      return "var(--party-democrat)";
    case "I":
      return "var(--party-independent)";
    default:
      return "var(--text-dim)";
  }
}

export function PartyTag({
  party,
  district,
}: {
  party: string | null;
  district: string | null;
}) {
  if (!party && !district) return null;
  const inner = [party, district].filter(Boolean).join(", ");
  return (
    <span style={{ color: partyColor(party) }}>({inner})</span>
  );
}
