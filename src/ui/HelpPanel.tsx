import "./ui.css";

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ahd-card ahd-card-pad" aria-labelledby={`help-${title.toLocaleLowerCase().replaceAll(" ", "-")}`}>
      <h2 id={`help-${title.toLocaleLowerCase().replaceAll(" ", "-")}`} className="ahd-h2">{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginTop: "0.65rem", fontSize: "0.82rem", lineHeight: 1.55 }}>
        {children}
      </div>
    </section>
  );
}

export function HelpPanel() {
  return (
    <div className="ahd-stack" aria-label="Help">
      <header className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">Offline help</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>Help</h1>
        <p className="ahd-muted" style={{ fontSize: "0.8rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
          This guide covers the local singleplayer game on this device. It works without a network connection.
        </p>
      </header>

      <HelpSection title="Start a local world">
        <p style={{ margin: 0 }}>
          Choose an era and a playable country, enter your name, and optionally enter a seed. The country list comes from the selected era. A seed makes the starting world repeatable; leaving it empty creates a random world.
        </p>
        <p style={{ margin: 0 }}>
          The game runs on this device after the world opens. Your country is fixed for that game. Start another world from the home screen when you want a different era or country.
        </p>
      </HelpSection>

      <HelpSection title="Actions and turns">
        <p style={{ margin: 0 }}>
          Actions shows the actions available to your player. Each action shows its action point cost and any requirement for an amount, party, or region. The app shows the reason when an action is unavailable.
        </p>
        <p style={{ margin: 0 }}>
          A successful action updates the world and saves automatically. A rejected action leaves the saved world unchanged. Open Menu and use End turn to move the local world forward one turn. Profile shows your character and resources when you start or resume. The footer shows the current turn and resource details. Open Economy or News from Menu for national figures or world events.
        </p>
      </HelpSection>

      <HelpSection title="Parties and elections">
        <p style={{ margin: 0 }}>
          Parties shows the parties in your country, their member counts and treasuries, and the available join or leave action. Joining or leaving uses the real action rules. Switching parties or leaving your party withdraws an active candidacy.
        </p>
        <p style={{ margin: 0 }}>
          Elections lists the races in the save with their status, dates, candidates, and winners. When a race accepts filings, join a party first if the race requires one, then use Run for office. You can withdraw from your own active candidacy while the race allows it.
        </p>
      </HelpSection>

      <HelpSection title="Legislature, banking, and news">
        <p style={{ margin: 0 }}>
          Legislature shows your office when you hold one, available proposals, bills, vote totals, and the actions allowed by the current bill stage. Banking and Portfolio show your cash, savings, and stock holdings. The market lists companies and supports trades in your own currency.
        </p>
        <p style={{ margin: 0 }}>
          News shows dated items from the local world. Empty sections mean the save has no record for that view.
        </p>
      </HelpSection>

      <HelpSection title="Saving and recovery">
        <p style={{ margin: 0 }}>
          Save writes the current world to this device. Starting a world, successful actions, and successful turns also save automatically. Exit saves before returning to the home screen. Continue resumes a saved world; Delete removes the selected saved world after confirmation.
        </p>
        <p style={{ margin: 0 }}>
          Import a JSON save from the home screen. If an import cannot be read, the app shows an error and keeps the current game open. If a save or local game operation fails, read the message, try again, or return to a known saved world.
        </p>
      </HelpSection>

      <HelpSection title="Available here">
        <ul style={{ margin: 0, paddingLeft: "1.15rem" }}>
          <li>Offline world creation for the eras and playable countries shown by the app.</li>
          <li>Local actions, turn advancement, economic and budget details, parties, candidacy, elections, legislature, world browsing, local search, news, banking, portfolio and stock market views.</li>
          <li>Device saves, resume, JSON import, confirmed deletion, and visible recovery errors.</li>
        </ul>
      </HelpSection>

      <HelpSection title="Still unavailable here">
        <p style={{ margin: 0 }}>
          Multiplayer accounts and live server play are not part of this offline app. The current local screen also does not expose the full AHDGame world destinations such as corporation management, unions, and notifications.
        </p>
        <p style={{ margin: 0 }}>
          Maps, changing your played country, regional legislative actions, and several advanced country systems remain unavailable. You can inspect regions and browse other nations. This project is development software; this page describes current behavior and does not claim a released native product.
        </p>
      </HelpSection>
    </div>
  );
}

export default HelpPanel;
