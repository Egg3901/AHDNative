# Offline world search

The game menu opens a local search across your profile, nations, companies and the player country's politicians, parties, elections and bills. Each result opens the corresponding existing detail page. Foreign nation/company browsing leaves the played country unchanged. Country-scoped result types are limited to the same scope their detail adapters support.

The query runs in the simulation worker only after submitting the form. It reads the current world, never mutates it, and keeps at most 30 results while reporting the total match count. Matching folds case/accents and requires every word; exact titles and title prefixes rank first. Deterministic tie ordering does not depend on host locale. No whole directory is sent to React to search, and no index can go stale after actions or save loads.

The presentation ignores responses from superseded searches, reports failures and supports retry. Empty and unmatched queries are supported. Selecting a result moves focus to the destination. Existing party, election, company, nation and bill routes accept the selected id; the politician directory now accepts an initial person as well.

The source reference is AHDGame `src/components/UniversalSearch.tsx` at `e364c04954ed628beef73a993a8e9e156650a31e`, with titled results, descriptions and direct destination navigation. This slice adapts that behavior to local data and explicit submission. It does not import its server transport, account/admin results, online autocomplete, or unsupported region/seat/commodity/currency/bond destinations. Those are remaining search-parity work.

Validation boundaries are `GameSession.search`, the actual SearchPanel contract, and production-browser navigation. The browser starts a real UK world, goes offline, searches and opens the correct party, foreign nation and foreign company, and confirms the country and turn remain unchanged. A genuine elected US save supplies the bill, election and politician detail flow. Unit checks cover bounded/repeatable results, no world mutation, save/reload, stale results and retry.
