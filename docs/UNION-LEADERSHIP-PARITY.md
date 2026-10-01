# Corporate-sector union player flows

Reference mechanics: AHDGame `954f1c21781e6e767455a15eed40f73993d89a8b`.
A follow-up source read at `2480b4db3cde3a6210000833d88f0b53e7f07917`
found only removed bargaining read caching, with those mechanics unchanged.

The actual corporate-sector workers, union density and `representingUnionId`
feed organizer strength, represented membership, dues and employer locals.
Player organization opens a weighted leadership ballot at source strength 100;
an offered presidency requires acceptance. Only its recorded player president
sets dues or directs sector organization and bargaining. Dues respect source
wages and the 10% ceiling, and enter the treasury once per ordinary union turn.

Player controls expose a represented employer's campaign, source NPC response,
counteroffer, acceptance, weighted ratification and settlement. Industrial-action
escalation reports source support requirements, marks affected locals and can
be withdrawn. Employer moves run internally in the turn phase. No arbitrary
public NPC action endpoint is exposed.

Original #297 verification:

- Organization and dues: `leadership.test.ts`, `duesActions.test.ts`, and
  `unionLeadershipSession.test.ts` use recorded sector workers and persist
  presidency, dues and organization through the public save/session contract.
- Strikes/bargaining: `bargaining.test.ts`, `labourRelations.test.ts`,
  `unionBargainingSession.test.ts`, and `UnionManagementPanel.test.tsx` exercise
  source authority, overtime-ban escalation, selective strike, withdrawal,
  ratification and saved agreement state.
- `smoke/union-leadership-flow.spec.ts` passes the full actual 390px new-game
  flow: organize, elect, accept, set dues, advance for treasury, organize sector,
  open bargaining, receive employer counter, accept, ratify, settle, save and
  normal reload. The displayed employer wage is compared with the same saved
  settlement rate. There are no page errors or horizontal overflow.

#322/#114 remain open: calculated worker political nudges have no valid
source-backed downstream metric consumer in this slice. An invented neutral-50
write is excluded. Current Game/Client SP interchange, wider union mechanics,
MP server integration and physical-device gates retain their own acceptance.
