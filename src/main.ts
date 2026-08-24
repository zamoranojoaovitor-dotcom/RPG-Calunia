import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "rpg-calunia";

const skills = [
  { name: "Raciocínio", bonus: 6 },
  { name: "Investigação", bonus: 7 },
  { name: "Percepção", bonus: 4 },
  { name: "Memória", bonus: 3 },
  { name: "Sangue-Frio", bonus: 5 },
  { name: "Vontade", bonus: 6 },
  { name: "Concentração", bonus: 4 },
  { name: "Manipulação", bonus: 7 },
  { name: "Leitura", bonus: 3 },
];

const pendingRolls = new Map<string, string>();

async function start() {
  const playerName = await OBR.player.getName();
  const playerRole = await OBR.player.getRole();

  // ==========================================================
  // RECEBER RESULTADOS DO DICE+
  // ==========================================================

  OBR.broadcast.onMessage(
    `${EXTENSION_ID}/roll-result`,
    (event) => {
      const result = event.data as {
        rollId: string;
        playerId: string;
        playerName: string;
        result?: {
          totalValue?: number;
          rollSummary?: string;
        };
      };

      console.log("Resultado recebido:", result);

      const skillName = pendingRolls.get(result.rollId);

      const status =
        document.querySelector<HTMLParagraphElement>("#status");

      if (!status) return;

      if (result.result?.totalValue !== undefined) {
        if (skillName) {
          status.textContent =
            `${result.playerName} — ${skillName} — ${result.result.totalValue}`;
        } else {
          status.textContent =
            `${result.playerName} — ${result.result.totalValue}`;
        }

        pendingRolls.delete(result.rollId);
      }
    }
  );

  // ==========================================================
  // GM
  // ==========================================================

  if (playerRole === "GM") {
    const players = await OBR.party.getPlayers();

    const playerCards = players
      .map((player) => {
        const skillButtons = skills
          .map(
            (skill) =>
              `<button
                class="request-button"
                data-player-id="${player.id}"
                data-player-name="${player.name}"
                data-skill="${skill.name}"
                data-bonus="${skill.bonus}"
              >
                ${skill.name}
              </button>`
          )
          .join("");

        return `
          <div class="player-card">
            <h3>${player.name}</h3>

            <div class="skill-grid">
              ${skillButtons}
            </div>
          </div>
        `;
      })
      .join("");

    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
      <div class="app">
        <h1>RPG Calúnia</h1>

        <p>Jogador: <strong>${playerName}</strong></p>
        <p>Função: <strong>Mestre</strong></p>

        <hr />

        <h2>Solicitar teste</h2>

        ${
          players.length > 0
            ? playerCards
            : "<p>Nenhum jogador conectado.</p>"
        }

        <hr />

        <h2>Resultado</h2>

        <p id="status">Aguardando...</p>
      </div>
    `;

    document
      .querySelectorAll<HTMLButtonElement>(".request-button")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const targetPlayerId = button.dataset.playerId!;
          const targetPlayerName = button.dataset.playerName!;
          const skillName = button.dataset.skill!;
          const bonus = Number(button.dataset.bonus);

          const status =
            document.querySelector<HTMLParagraphElement>("#status")!;

          try {
            await OBR.broadcast.sendMessage(
              "rpg-calunia/test-request",
              {
                targetPlayerId,
                targetPlayerName,
                skillName,
                bonus,
                requesterName: playerName,
                timestamp: Date.now(),
              },
              {
                destination: "ALL",
              }
            );

            status.textContent =
              `Teste de ${skillName} enviado para ${targetPlayerName}.`;
          } catch (error) {
            console.error(error);
            status.textContent =
              "Erro ao enviar o teste.";
          }
        });
      });

    return;
  }

  // ==========================================================
  // PLAYER
  // ==========================================================

  const pendingTestRaw =
    localStorage.getItem("rpg-calunia-pending-test");

  const pendingTest = pendingTestRaw
    ? JSON.parse(pendingTestRaw)
    : null;

  // ==========================================================
  // CASO TENHA UM TESTE PENDENTE
  // ==========================================================

  if (pendingTest) {
    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
      <div class="app">
        <h1>RPG Calúnia</h1>

        <p>Jogador: <strong>${playerName}</strong></p>

        <hr />

        <h2>🔔 TESTE SOLICITADO</h2>

        <p>O Mestre solicitou:</p>

        <h3>${pendingTest.skillName}</h3>

        <p>Bônus: +${pendingTest.bonus}</p>

        <button id="requested-roll">
          ROLAR
        </button>

        <p id="status"></p>
      </div>
    `;

    document
      .querySelector<HTMLButtonElement>("#requested-roll")!
      .addEventListener("click", async () => {
        const status =
          document.querySelector<HTMLParagraphElement>("#status")!;

        const playerId = await OBR.player.getId();

        const rollId =
          `roll_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;

        pendingRolls.set(
          rollId,
          pendingTest.skillName
        );

        status.textContent = "Rolando...";

        try {
          await OBR.broadcast.sendMessage(
            "dice-plus/roll-request",
            {
              rollId,
              playerId,
              playerName,
              rollTarget: "gm_only",
              diceNotation:
                `1d20+${pendingTest.bonus}`,
              showResults: false,
              timestamp: Date.now(),
              source: EXTENSION_ID,
            },
            {
              destination: "ALL",
            }
          );

          localStorage.removeItem(
            "rpg-calunia-pending-test"
          );

          OBR.action.setBadgeText("");

          status.textContent =
            "Teste enviado ao Mestre.";
        } catch (error) {
          console.error(error);

          status.textContent =
            "Erro ao realizar o teste.";
        }
      });

    return;
  }

  // ==========================================================
  // PLAYER NORMAL
  // ==========================================================

  const skillButtons = skills
    .map(
      (skill) =>
        `<button
          class="skill-button"
          data-skill="${skill.name}"
          data-bonus="${skill.bonus}"
        >
          ${skill.name} +${skill.bonus}
        </button>`
    )
    .join("");

  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div class="app">
      <h1>RPG Calúnia</h1>

      <p>Jogador: <strong>${playerName}</strong></p>
      <p>Função: <strong>Jogador</strong></p>

      <hr />

      <h2>Meus testes</h2>

      ${skillButtons}

      <p id="status"></p>
    </div>
  `;

  document
    .querySelectorAll<HTMLButtonElement>(".skill-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const skillName = button.dataset.skill!;
        const bonus =
          Number(button.dataset.bonus);

        const status =
          document.querySelector<HTMLParagraphElement>("#status")!;

        const playerId =
          await OBR.player.getId();

        const rollId =
          `roll_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;

        pendingRolls.set(
          rollId,
          skillName
        );

        status.textContent =
          `Rolando ${skillName}...`;

        try {
          await OBR.broadcast.sendMessage(
            "dice-plus/roll-request",
            {
              rollId,
              playerId,
              playerName,
              rollTarget: "gm_only",
              diceNotation:
                `1d20+${bonus}`,
              showResults: false,
              timestamp: Date.now(),
              source: EXTENSION_ID,
            },
            {
              destination: "ALL",
            }
          );

          status.textContent =
            `${skillName} enviado para rolagem.`;
        } catch (error) {
          console.error(error);

          pendingRolls.delete(rollId);

          status.textContent =
            "Erro ao enviar a rolagem.";
        }
      });
    });
}

OBR.onReady(start);