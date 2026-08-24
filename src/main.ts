import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "rpg-calunia";
const TEST_REQUEST_CHANNEL = "rpg-calunia/test-request";
const LOCAL_REQUEST_CHANNEL = "rpg-calunia/show-test-request";
const METADATA_KEY = "rpg-calunia/pending-test";

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

type TestRequest = {
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  bonus: number;
  requesterName: string;
  timestamp: number;
};

type RollGroup = {
  description?: string;
  diceModel?: string;
  diceType: string;
  dice: unknown[];
  total: number;
  isNegative?: boolean;
};

type RollResult = {
  rollId: string;
  playerId: string;
  playerName: string;
  rollTarget: "everyone" | "self" | "dm" | "gm_only";
  timestamp: number;
  result?: {
    rollId: string;
    diceNotation: string;
    totalValue: number;
    rollSummary: string;
    groups?: RollGroup[];
  };
};

// Guarda o nome do atributo associado a cada rolagem
// iniciada por esta interface.
const pendingRolls = new Map<string, string>();

// Evita processar o mesmo resultado mais de uma vez.
const processedRolls = new Set<string>();

async function start() {
  const playerName = await OBR.player.getName();
  const playerRole = await OBR.player.getRole();
  const playerId = await OBR.player.getId();

  console.log("RPG Calúnia iniciado.");
  console.log("Jogador:", playerName);
  console.log("Função:", playerRole);
  console.log("Player ID:", playerId);

  // ============================================================
  // RESULTADOS DEVOLVIDOS PELO DICE+
  // ============================================================

  OBR.broadcast.onMessage(
    `${EXTENSION_ID}/roll-result`,
    (event) => {
      const result = event.data as RollResult;

      console.log("Resultado recebido do Dice+:", result);

      // Impede que o mesmo resultado seja mostrado duas vezes.
      if (processedRolls.has(result.rollId)) {
        console.log(
          "Resultado duplicado ignorado:",
          result.rollId
        );
        return;
      }

      processedRolls.add(result.rollId);

      const localSkillName =
        pendingRolls.get(result.rollId);

      const groups =
        result.result?.groups ?? [];

      // Dice+ coloca aqui a descrição usada depois do "#".
      const skillFromDescription =
        groups
          .map((group) => group.description)
          .find(
            (description) =>
              typeof description === "string" &&
              description.trim().length > 0
          );

      // Fallback: tenta ler diretamente da fórmula.
      const notation =
        result.result?.diceNotation ?? "";

      const skillFromNotation =
        notation.includes("#")
          ? notation
              .split("#")
              .slice(1)
              .join("#")
              .trim()
          : undefined;

      const skillName =
        skillFromDescription ??
        skillFromNotation ??
        localSkillName ??
        "Teste";

      const status =
        document.querySelector<HTMLParagraphElement>(
          "#status"
        );

      if (
        status &&
        result.result?.totalValue !== undefined
      ) {
        status.textContent =
          `${result.playerName} — ${skillName} — ${result.result.totalValue}`;
      }

      pendingRolls.delete(result.rollId);

      // Evita deixar a memória crescer indefinidamente.
      // Mantemos apenas os últimos 100 IDs processados.
      if (processedRolls.size > 100) {
        const firstId = processedRolls.values().next().value;

        if (firstId) {
          processedRolls.delete(firstId);
        }
      }
    }
  );

  // ============================================================
  // PEDIDO RECEBIDO PELO BACKGROUND
  // ============================================================

  OBR.broadcast.onMessage(
    LOCAL_REQUEST_CHANNEL,
    (event) => {
      const request =
        event.data as TestRequest;

      console.log(
        "Pedido recebido pela interface:",
        request
      );

      // Remove o badge assim que o pedido chegou
      // na interface.
      OBR.action.setBadgeText(undefined);

      renderPlayerInterface(
        playerName,
        request,
        playerId
      );
    }
  );

  // ============================================================
  // PAINEL DO MESTRE
  // ============================================================

  if (playerRole === "GM") {
    const players =
      await OBR.party.getPlayers();

    console.log(
      "Jogadores na sala:",
      players
    );

    const playerCards =
      players
        .map((player) => {
          const skillButtons =
            skills
              .map(
                (skill) =>
                  `<button
                    class="request-button"
                    data-player-id="${player.id}"
                    data-player-name="${escapeHtml(player.name)}"
                    data-skill="${skill.name}"
                    data-bonus="${skill.bonus}"
                  >
                    ${skill.name}
                  </button>`
              )
              .join("");

          return `
            <div class="player-card">
              <h3>
                ${escapeHtml(player.name)}
              </h3>

              <div class="skill-grid">
                ${skillButtons}
              </div>
            </div>
          `;
        })
        .join("");

    document.querySelector<HTMLDivElement>(
      "#app"
    )!.innerHTML = `
      <div class="app">
        <h1>RPG Calúnia</h1>

        <p>
          Jogador:
          <strong>${escapeHtml(playerName)}</strong>
        </p>

        <p>
          Função:
          <strong>Mestre</strong>
        </p>

        <hr />

        <h2>Solicitar teste</h2>

        <div id="players">
          ${
            players.length > 0
              ? playerCards
              : "<p>Nenhum jogador conectado.</p>"
          }
        </div>

        <hr />

        <h2>Último resultado</h2>

        <p id="status">
          Aguardando...
        </p>
      </div>
    `;

    document
      .querySelectorAll<HTMLButtonElement>(
        ".request-button"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const targetPlayerId =
              button.dataset.playerId!;

            const targetPlayerName =
              button.dataset.playerName!;

            const skillName =
              button.dataset.skill!;

            const bonus =
              Number(button.dataset.bonus);

            const status =
              document.querySelector<HTMLParagraphElement>(
                "#status"
              )!;

            const request: TestRequest = {
              targetPlayerId,
              targetPlayerName,
              skillName,
              bonus,
              requesterName: playerName,
              timestamp: Date.now(),
            };

            try {
              await OBR.broadcast.sendMessage(
                TEST_REQUEST_CHANNEL,
                request,
                {
                  destination: "ALL",
                }
              );

              status.textContent =
                `Teste de ${skillName} enviado para ${targetPlayerName}.`;

              console.log(
                "Pedido enviado:",
                request
              );
            } catch (error) {
              console.error(
                "Erro ao solicitar teste:",
                error
              );

              status.textContent =
                "Erro ao enviar o teste.";
            }
          }
        );
      });

    return;
  }

  // ============================================================
  // INTERFACE DO JOGADOR
  // ============================================================

  const metadata =
    await OBR.player.getMetadata();

  const storedPendingRequest =
    metadata[METADATA_KEY] as
      | TestRequest
      | undefined;

  renderPlayerInterface(
    playerName,
    storedPendingRequest ?? null,
    playerId
  );

  // ============================================================
  // OBSERVAR ALTERAÇÕES DO JOGADOR
  // ============================================================

  OBR.player.onChange(
    (player) => {
      const updatedRequest =
        player.metadata[
          METADATA_KEY
        ] as TestRequest | undefined;

      if (updatedRequest) {
        OBR.action.setBadgeText("!");

        renderPlayerInterface(
          playerName,
          updatedRequest,
          player.id
        );
      }
    }
  );
}

// ============================================================
// INTERFACE DO JOGADOR
// ============================================================

function renderPlayerInterface(
  playerName: string,
  pendingRequest: TestRequest | null,
  playerId: string
) {
  const skillButtons =
    skills
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

  document.querySelector<HTMLDivElement>(
    "#app"
  )!.innerHTML = `
    <div class="app">
      <h1>RPG Calúnia</h1>

      <p>
        Jogador:
        <strong>${escapeHtml(playerName)}</strong>
      </p>

      <p>
        Função:
        <strong>Jogador</strong>
      </p>

      ${
        pendingRequest
          ? `
            <hr />

            <div class="pending-test">
              <h2>🔔 TESTE SOLICITADO</h2>

              <p>
                O Mestre solicitou:
              </p>

              <h3>
                ${escapeHtml(
                  pendingRequest.skillName
                )}
              </h3>

              <p>
                Bônus:
                +${pendingRequest.bonus}
              </p>

              <button id="requested-roll">
                ROLAR
              </button>
            </div>

            <hr />
          `
          : ""
      }

      <h2>Meus testes</h2>

      ${skillButtons}

      <p id="status"></p>
    </div>
  `;

  // ============================================================
  // TESTE SOLICITADO PELO MESTRE
  // ============================================================

  const requestedRoll =
    document.querySelector<HTMLButtonElement>(
      "#requested-roll"
    );

  if (
    requestedRoll &&
    pendingRequest
  ) {
    requestedRoll.addEventListener(
      "click",
      async () => {
        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          )!;

        const rollId =
          createRollId();

        pendingRolls.set(
          rollId,
          pendingRequest.skillName
        );

        status.textContent =
          `Rolando ${pendingRequest.skillName}...`;

        try {
          await OBR.broadcast.sendMessage(
            "dice-plus/roll-request",
            {
              rollId,
              playerId,
              playerName,
              rollTarget: "gm_only",

              diceNotation:
                `1d20+${pendingRequest.bonus} # ${pendingRequest.skillName}`,

              showResults: false,
              timestamp: Date.now(),
              source: EXTENSION_ID,
            },
            {
              destination: "ALL",
            }
          );

          // Remove o pedido pendente.
          await OBR.player.setMetadata({
            [METADATA_KEY]: undefined,
          });

          // Remove a bolinha/badge da extensão.
          await OBR.action.setBadgeText(
            undefined
          );

          // Em vez de remover somente o card,
          // reconstruímos toda a interface.
          renderPlayerInterface(
            playerName,
            null,
            playerId
          );
        } catch (error) {
          console.error(
            "Erro ao realizar teste solicitado:",
            error
          );

          pendingRolls.delete(rollId);

          status.textContent =
            "Erro ao realizar o teste.";
        }
      }
    );
  }

  // ============================================================
  // TESTES ESPONTÂNEOS
  // ============================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      ".skill-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const skillName =
            button.dataset.skill!;

          const bonus =
            Number(button.dataset.bonus);

          const status =
            document.querySelector<HTMLParagraphElement>(
              "#status"
            )!;

          const rollId =
            createRollId();

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
                  `1d20+${bonus} # ${skillName}`,

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
            console.error(
              "Erro ao enviar rolagem:",
              error
            );

            pendingRolls.delete(
              rollId
            );

            status.textContent =
              "Erro ao enviar a rolagem.";
          }
        }
      );
    });
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function createRollId() {
  return `roll_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

OBR.onReady(start);