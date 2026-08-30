# Claim tagging — VERIFY / CONFLICT / OPINION

Codebase-wide convention for provenance and epistemic status. Inspired by forensic dilution reports (e.g. CELU-style dossiers) and adapted for Short Check's layered stack.

**Precedence:** Deterministic scan facts > SEC EDGAR excerpts > DilutionTracker OCR > news wires > LLM synthesis.

---

## Tags

| Tag | Meaning | When to use |
|-----|---------|-------------|
| *(none / `verified`)* | Grounded in supplied primary data | Walk-away flags, CP excerpts with accession, Fast Verdict fields, DT badges from OCR |
| **`VERIFY`** | Not confirmed in the fact pack; do not state as fact | Missing filings, vendor-only figures, inferred dates, unparsed insider direction |
| **`CONFLICT`** | Two sources disagree; **EDGAR / scan API governs** | DT float vs scan float, vendor vs SEC, ambiguous rule citations |
| **`OPINION`** | Synthesis or judgment — not permission to trade | CEO/trader lens, "likely next financing," level calls without instrument data |

### Rules

1. **Never soften binding walk-aways** with OPINION.
2. **LLM output** must prefix uncertain sentences with `VERIFY:`, `CONFLICT:`, or `OPINION:` inline (see `lib/claims/format.ts`).
3. **Deterministic code** uses `TaggedClaim` objects (`lib/claims/types.ts`) — UI and prompts render from structure, not regex alone.
4. **PDF / copy export** strips or expands tags via `formatTaggedClaimPlain()` / `formatTaggedClaimInline()`.

---

## Code locations

| Module | Role |
|--------|------|
| `lib/claims/types.ts` | `ClaimTag`, `TaggedClaim`, `ClaimSource` |
| `lib/claims/format.ts` | Inline markers, parse, normalize |
| `lib/forensic/types.ts` | `ForensicFactPack` — Layer B fact JSON |
| `lib/forensic/buildFactPack.ts` | Assemble fact pack from scan + Short Check input |
| `lib/ai/buildThesisPrompt.ts` | Injects fact pack + tagging rules into Groq prompt |
| `components/claims/TaggedText.tsx` | Renders inline tags in UI |

---

## Examples

**Verified (structured):**

```typescript
{
  text: "Active ATM/ELOC with confirmed draw",
  tag: "verified",
  sources: [{ kind: "edgar", accessionNumber: "0001234567-26-000123", label: "10-Q" }]
}
```

**VERIFY (inline in LLM prose):**

> VERIFY: Borrow fee and availability were not present in the fact pack — short mechanics unconfirmed.

**CONFLICT:**

> CONFLICT: DilutionTracker float 8.87M vs scan float 18.54M — EDGAR/scan governs for synthesis.

**OPINION:**

> OPINION: A rally into the $1.50–$2.00 zone would arm resale-registered supply before compliance cures complete.

---

## Adding tags to new features

1. Add facts to `ForensicFactPack` (or a domain-specific pack) as `TaggedClaim[]`.
2. Run conflict detection in `buildFactPack` when two sources exist.
3. Pass pack into LLM prompts; require tagging in system prompt.
4. Render with `TaggedText` or structured list with tag badges.

See [`FORENSIC_REPORT_ROADMAP.md`](FORENSIC_REPORT_ROADMAP.md) for the full forensic report program.
