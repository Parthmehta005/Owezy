# M8 design directions (waiting for the owner's pick)

**View them here:** https://claude.ai/artifact/7aSrNyYzcq8xXZacMGWMCF (private to the owner; open it while signed in to claude.ai).

Each row on that page is one direction, shown on three screens: the group screen (light mode), Balances (dark mode) and the add-expense sheet (light mode). All use the same Goa-trip data, so only the look differs. You can comment on any screen right on the page.

The files in this folder are the source of those mockups (`Main.dc.html` is A's group screen). They need the page above to display; opened directly in a browser they won't render properly.

| | Direction | Feel |
|---|---|---|
| **A** | **Calm** | Soft white cards on a pale background, deep teal. Your total sits in a teal card with the people behind it ("Rahul owes you ₹965 · Neha ₹815 · You owe Bilal ₹885"). Rounded and quiet, the most "banking app" of the three. |
| **B** | **Bold** | A big indigo block at the top with a large ₹895, people as swipeable pills, and chunky type. Balances become big per-person tiles, and the add-expense button is full width at the bottom. Payers are picked from avatars in one tap, instead of opening a list. |
| **C** | **Receipt** | Black ink, monospace numbers, dotted lines like a bill. The split shows as a little receipt (each share, total, "you get back"). Distinctive and minimal, but less friendly to people who aren't into it. |

Same in all three:
- **Same flows:** add is still 3 taps and Save stays at the top, so the phone keyboard can't hide it.
- **Avatars:** a coloured initial for each person.
- **Plain money:** "₹900" instead of "₹900.00".
- **Readable dark mode:** tinted, with "you get back" and "you owe" colours that stay easy to tell apart.

## Questions for the owner
1. **Which direction?** Mixing is fine, e.g. "A's colours with B's one-tap payer picker", or "B but calmer".
2. **Balances layout:** B shows your per-person standing *and* the simplified "who pays whom" list together. A and C show per-person cards with a Simplify switch underneath. Which do you prefer?

Once picked, the choice goes into ROADMAP.md (M8, first task) and the build starts.
