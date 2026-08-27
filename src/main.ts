import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "rpg-calunia";
const TEST_REQUEST_CHANNEL = "rpg-calunia/test-request";
const LOCAL_REQUEST_CHANNEL = "rpg-calunia/show-test-request";
const METADATA_KEY = "rpg-calunia/pending-test";
const HISTORY_STORAGE_KEY = "rpg-calunia/gm-history";

const skills = [
  "Raciocínio",
  "Investigação",
  "Percepção",
  "Memória",
  "Sangue-Frio",
  "Vontade",
  "Concentração",
  "Manipulação",
  "Leitura",
];

type TestRequest = {
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  requesterName: string;
  timestamp: number;
};

type HistoryEntry = {
  playerId: string;
  playerName: string;
  skillName: string;
  total: number;
  source: "player" | "gm";
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

const pendingRolls = new Map<string, string>();
const pendingRollPlayers = new Map<string, string>();
const processedRolls = new Set<string>();

function clearBadge() {
  return OBR.action.setBadgeText(undefined);
}

function getGmHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGmHistory(history: HistoryEntry[]) {
  localStorage.setItem(
    HISTORY_STORAGE_KEY,
    JSON.stringify(history)
  );
}

function addGmHistory(entry: HistoryEntry) {
  const history = getGmHistory();

  history.unshift(entry);

  saveGmHistory(history.slice(0, 100));
}

function clearGmHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  renderGmHistory();
}

function renderGmHistory() {
  const container =
    document.querySelector<HTMLDivElement>("#history");

  if (!container) return;

  const history = getGmHistory();

  if (history.length === 0) {
    container.innerHTML =
      "<p>Nenhum teste realizado ainda.</p>";
    return;
  }

  container.innerHTML = history
    .map((entry) => {
      const time = new Date(
        entry.timestamp
      ).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `
        <div class="history-entry">
          <strong>
            ${escapeHtml(entry.playerName)}
          </strong>

          <span>
            ${escapeHtml(entry.skillName)}
            — ${entry.total}
          </span>

          <small>
            ${time}
            • ${entry.source === "gm" ? "Mestre" : "Jogador"}
          </small>
        </div>
      `;
    })
    .join("");
}

function extractSkillName(
  result: RollResult,
  fallback?: string
) {
  const groups = result.result?.groups ?? [];

  const description = groups
    .map((group) => group.description)
    .find(
      (value) =>
        typeof value === "string" &&
        value.trim().length > 0
    );

  if (description) {
    return normalizeSkillName(description);
  }

  if (fallback) {
    return fallback;
  }

  return "Teste";
}

function normalizeSkillName(value: string) {
  const normalized = value
    .replaceAll("-", " ")
    .trim()
    .toLowerCase();

  const found = skills.find(
    (skill) =>
      skill
        .replaceAll("-", " ")
        .toLowerCase() === normalized
  );

  return found ?? value;
}

async function start() {
  const playerName = await OBR.player.getName();
  const playerRole = await OBR.player.getRole();
  const playerId = await OBR.player.getId();

  // ============================================================
  // RESULTADOS DO DICE+
  // ============================================================

  OBR.broadcast.onMessage(
    `${EXTENSION_ID}/roll-result`,
    (event) => {
      const result = event.data as RollResult;

      if (processedRolls.has(result.rollId)) {
        return;
      }

      processedRolls.add(result.rollId);

      const fallbackSkill =
        pendingRolls.get(result.rollId);

      const skillName =
        extractSkillName(
          result,
          fallbackSkill
        );

      const total =
        result.result?.totalValue;

      if (total === undefined) return;

      const status =
        document.querySelector<HTMLParagraphElement>(
          "#status"
        );

      if (playerRole === "GM") {
        const source =
          pendingRollPlayers.has(result.rollId)
            ? "gm"
            : "player";

        addGmHistory({
          playerId: result.playerId,
          playerName: result.playerName,
          skillName,
          total,
          source,
          timestamp: Date.now(),
        });

        renderGmHistory();

        if (status) {
          status.textContent =
            `${result.playerName} — ${skillName} — ${total}`;
        }
      } else {
        if (status) {
          status.textContent =
            `${result.playerName} — ${skillName} — ${total}`;
        }
      }

      pendingRolls.delete(result.rollId);
      pendingRollPlayers.delete(result.rollId);
    }
  );

  // ============================================================
  // PEDIDO RECEBIDO
  // ============================================================

  OBR.broadcast.onMessage(
    LOCAL_REQUEST_CHANNEL,
    async (event) => {
      const request =
        event.data as TestRequest;

      await clearBadge();

      renderPlayerInterface(
        playerName,
        request,
        playerId
      );
    }
  );

  // ============================================================
  // MESTRE
  // ============================================================

  if (playerRole === "GM") {
    const players =
      await OBR.party.getPlayers();

    renderGmInterface(
      playerName,
      players
    );

    OBR.party.onChange(
      (updatedPlayers) => {
        renderGmInterface(
          playerName,
          updatedPlayers
        );
      }
    );

    return;
  }

  // ============================================================
  // JOGADOR
  // ============================================================

  const metadata =
    await OBR.player.getMetadata();

  const pendingRequest =
    metadata[METADATA_KEY] as
      | TestRequest
      | undefined;

  renderPlayerInterface(
    playerName,
    pendingRequest ?? null,
    playerId
  );

  OBR.player.onChange(
    (player) => {
      const updatedRequest =
        player.metadata[
          METADATA_KEY
        ] as
          | TestRequest
          | undefined;

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
// MESTRE
// ============================================================

function renderGmInterface(
  playerName: string,
  players: any[]
) {
  const playerCards =
    players
      .map((player) => {
        const rows = skills
          .map(
            (skill) => `
              <div class="gm-skill-row">
                <span>
                  ${escapeHtml(skill)}
                </span>

                <div>
                  <button
                    class="request-button"
                    data-player-id="${player.id}"
                    data-player-name="${escapeHtml(player.name)}"
                    data-skill="${escapeHtml(skill)}"
                  >
                    PEDIR
                  </button>

                  <button
                    class="gm-roll-button"
                    data-player-id="${player.id}"
                    data-player-name="${escapeHtml(player.name)}"
                    data-skill="${escapeHtml(skill)}"
                  >
                    ROLAR
                  </button>
                </div>
              </div>
            `
          )
          .join("");

        return `
          <div class="player-card">
            <h3>
              ${escapeHtml(player.name)}
            </h3>

            ${rows}
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

      <h2>Jogadores</h2>

      ${
        players.length
          ? playerCards
          : "<p>Nenhum jogador conectado.</p>"
      }

      <hr />

      <h2>Último resultado</h2>

      <p id="status">
        Aguardando...
      </p>

      <hr />

      <div class="history-header">
        <h2>Histórico secreto</h2>

        <button id="clear-history">
          LIMPAR
        </button>
      </div>

      <div id="history"></div>
    </div>
  `;

  renderGmHistory();

  // ==========================================================
  // PEDIR
  // ==========================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      ".request-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const request: TestRequest = {
            targetPlayerId:
              button.dataset.playerId!,

            targetPlayerName:
              button.dataset.playerName!,

            skillName:
              button.dataset.skill!,

            requesterName:
              playerName,

            timestamp:
              Date.now(),
          };

          const status =
            document.querySelector<HTMLParagraphElement>(
              "#status"
            )!;

          try {
            await OBR.broadcast.sendMessage(
              TEST_REQUEST_CHANNEL,
              request,
              {
                destination: "ALL",
              }
            );

            status.textContent =
              `Teste de ${request.skillName} enviado para ${request.targetPlayerName}.`;

          } catch {
            status.textContent =
              "Erro ao enviar o teste.";
          }
        }
      );
    });

  // ==========================================================
  // ROLAR PELO MESTRE
  // ==========================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      ".gm-roll-button"
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

          pendingRollPlayers.set(
            rollId,
            targetPlayerId
          );

          status.textContent =
            `Rolando ${skillName} de ${targetPlayerName}...`;

          try {
            await OBR.broadcast.sendMessage(
              "dice-plus/roll-request",
              {
                rollId,

                playerId:
                  targetPlayerId,

                playerName:
                  targetPlayerName,

                rollTarget:
                  "gm_only",

                diceNotation:
                  "1d20",

                showResults:
                  false,

                timestamp:
                  Date.now(),

                source:
                  EXTENSION_ID,
              },
              {
                destination: "ALL",
              }
            );
          } catch {
            pendingRolls.delete(
              rollId
            );

            pendingRollPlayers.delete(
              rollId
            );

            status.textContent =
              "Erro ao rolar.";
          }
        }
      );
    });

  document
    .querySelector<HTMLButtonElement>(
      "#clear-history"
    )
    ?.addEventListener(
      "click",
      () => {
        clearGmHistory();
      }
    );
}

// ============================================================
// JOGADOR
// ============================================================

function renderPlayerInterface(
  playerName: string,
  pendingRequest:
    | TestRequest
    | null,
  playerId: string
) {
  const buttons =
    skills
      .map(
        (skill) =>
          `<button
            class="skill-button"
            data-skill="${escapeHtml(skill)}"
          >
            ${escapeHtml(skill)}
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
        <strong>
          ${escapeHtml(playerName)}
        </strong>
      </p>

      <p>
        Função:
        <strong>Jogador</strong>
      </p>

      ${
        pendingRequest
          ? `
            <div class="pending-test">
              <hr />

              <h2>
                🔔 TESTE SOLICITADO
              </h2>

              <p>
                O Mestre solicitou:
              </p>

              <h3>
                ${escapeHtml(
                  pendingRequest.skillName
                )}
              </h3>

              <button id="requested-roll">
                ROLAR
              </button>
            </div>
          `
          : ""
      }

      <hr />

      <h2>Meus testes</h2>

      ${buttons}

      <p id="status"></p>
    </div>
  `;

  // ==========================================================
  // PEDIDO DO MESTRE
  // ==========================================================

  document
    .querySelector<HTMLButtonElement>(
      "#requested-roll"
    )
    ?.addEventListener(
      "click",
      async () => {
        if (!pendingRequest) {
          return;
        }

        const rollId =
          createRollId();

        pendingRolls.set(
          rollId,
          pendingRequest.skillName
        );

        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          )!;

        status.textContent =
          `Rolando ${pendingRequest.skillName}...`;

        try {
          await OBR.broadcast.sendMessage(
            "dice-plus/roll-request",
            {
              rollId,

              playerId,

              playerName,

              rollTarget:
                "gm_only",

              diceNotation:
                "1d20",

              showResults:
                false,

              timestamp:
                Date.now(),

              source:
                EXTENSION_ID,
            },
            {
              destination:
                "ALL",
            }
          );

          await OBR.player.setMetadata({
            [METADATA_KEY]:
              undefined,
          });

          await clearBadge();

          renderPlayerInterface(
            playerName,
            null,
            playerId
          );

        } catch {
          pendingRolls.delete(
            rollId
          );

          status.textContent =
            "Erro ao rolar.";
        }
      }
    );

  // ==========================================================
  // TESTES ESPONTÂNEOS
  // ==========================================================

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

          const rollId =
            createRollId();

          pendingRolls.set(
            rollId,
            skillName
          );

          const status =
            document.querySelector<HTMLParagraphElement>(
              "#status"
            )!;

          status.textContent =
            `Rolando ${skillName}...`;

          try {
            await OBR.broadcast.sendMessage(
              "dice-plus/roll-request",
              {
                rollId,

                playerId,

                playerName,

                rollTarget:
                  "gm_only",

                diceNotation:
                  "1d20",

                showResults:
                  false,

                timestamp:
                  Date.now(),

                source:
                  EXTENSION_ID,
              },
              {
                destination:
                  "ALL",
              }
            );
          } catch {
            pendingRolls.delete(
              rollId
            );

            status.textContent =
              "Erro ao rolar.";
          }
        }
      );
    });
}

// ============================================================
// AUXILIARES
// ============================================================

function createRollId() {
  return (
    `roll_${Date.now()}_` +
    Math.random()
      .toString(36)
      .substring(2, 9)
  );
}

function escapeHtml(
  value: string
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

OBR.onReady(start);