/**
 * ImperialProfileNotice: the Native imperial profile destination (#54).
 *
 * Renders only persisted record fields plus the reference gender-aware
 * ceremonial title (null where the reference configures none, e.g. ES/SE —
 * then no title is claimed). Text-only: the reference imperial page carries
 * no portrait/header imagery. Never offers an imperial creation form: the
 * reference `/create-imperial-character` page is admin-gated, so this states
 * the boundary honestly instead.
 */
import type { ImperialProfileView } from "../game/profileTypes";
import "./profile.css";

export function ImperialProfileNotice({ imperial }: { imperial: ImperialProfileView }) {
  return (
    <div className="ahd-stack ahd-profile">
      <section aria-label="Imperial character" className="ahd-card ahd-card-pad ahd-profile-header ahd-hero">
        <p className="ahd-label" style={{ marginBottom: "0.3rem" }}>Imperial profile</p>
        <h1 className="ahd-h1 ahd-profile-name">{imperial.fullName}</h1>
        <div className="ahd-profile-chips">
          {imperial.title ? (
            <span className="ahd-profile-chip ahd-profile-chip-static">{imperial.title}</span>
          ) : null}
          <span className="ahd-profile-chip ahd-profile-chip-static">{imperial.country.name}</span>
        </div>
        <div className="ahd-profile-places">
          <span>{imperial.royalHouse}</span>
          {imperial.homeState ? (
            <>
              <span aria-hidden="true" className="ahd-muted"> · </span>
              <span>{imperial.homeState}</span>
            </>
          ) : null}
        </div>
        {imperial.bio ? <p style={{ marginTop: "0.6rem" }}>{imperial.bio}</p> : null}
        <p className="ahd-help" style={{ marginTop: "0.6rem" }}>{imperial.notice}</p>
      </section>
    </div>
  );
}
