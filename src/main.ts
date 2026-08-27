import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "rpg-calunia";
const TEST_REQUEST_CHANNEL = "rpg-calunia/test-request";
const LOCAL_REQUEST_CHANNEL =
  "rpg-calunia/show-test-request";
const METADATA_KEY =
  "rpg-calunia/pending-test";

const HISTORY_STORAGE_KEY =
  "rpg-calunia/gm-history";

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
  rollTarget:
    | "everyone"
    | "self"
    | "dm"
    | "gm_only";
  timestamp: number;
  result?: {
    rollId: string;
    diceNotation: string;
    totalValue: number;
    rollSummary: string;
    groups?: RollGroup[];
  };
};

// Guarda o atributo associado a cada rolagem.
const pendingRolls =
  new Map<string, string>();

// Guarda qual jogador o Mestre estava rolando.
const pendingRollPlayers =
  new Map<string, string>();

// Impede processamento duplicado.
const processedRolls =
  new Set<string>();

let currentPlayers: any[] = [];

// ============================================================
// NOME SEGURO PARA NOTAÇÃO DO DICE+
// ============================================================
//
// Usado apenas quando quisermos colocar o nome da perícia
// dentro da notação com "#".
//
// Exemplo:
// "Sangue-Frio" -> "Sangue Frio"
// ============================================================

function getDiceSkillName(
  skillName: string
) {
  return skillName
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// RECUPERAR NOME ORIGINAL DA PERÍCIA
// ============================================================

function getOriginalSkillName(
  diceSkillName: string
) {
  const normalized =
    diceSkillName
      .replaceAll("-", " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const matchingSkill =
    skills.find((skill) => {
      const normalizedSkill =
        skill.name
          .replaceAll("-", " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      return (
        normalizedSkill ===
        normalized
      );
    });

  return (
    matchingSkill?.name ??
    diceSkillName
  );
}

// ============================================================
// LIMPAR BADGE
// ============================================================

async function clearBadge() {
  try {
    await OBR.action.setBadgeText(
      undefined
    );
  } catch (error) {
    console.error(
      "Erro ao limpar badge:",
      error
    );
  }
}

// ============================================================
// HISTÓRICO DO MESTRE
// ============================================================

function getGmHistory(): HistoryEntry[] {
  try {
    const raw =
      localStorage.getItem(
        HISTORY_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.error(
      "Erro ao carregar histórico:",
      error
    );

    return [];
  }
}

function saveGmHistory(
  history: HistoryEntry[]
) {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history)
    );
  } catch (error) {
    console.error(
      "Erro ao salvar histórico:",
      error
    );
  }
}

function addGmHistory(
  entry: HistoryEntry
) {
  const history =
    getGmHistory();

  history.unshift(entry);

  const limited =
    history.slice(0, 100);

  saveGmHistory(limited);

  return limited;
}

function clearGmHistory() {
  localStorage.removeItem(
    HISTORY_STORAGE_KEY
  );

  renderGmHistory();
}

function renderGmHistory() {
  const history =
    getGmHistory();

  const container =
    document.querySelector<HTMLDivElement>(
      "#history"
    );

  if (!container) {
    return;
  }

  if (history.length === 0) {
    container.innerHTML = `
      <p>Nenhum teste realizado ainda.</p>
    `;

    return;
  }

  container.innerHTML =
    history
      .map((entry) => {
        const date =
          new Date(
            entry.timestamp
          );

        const time =
          date.toLocaleTimeString(
            "pt-BR",
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );

        return `
          <div class="history-entry">
            <strong>
              ${escapeHtml(
                entry.playerName
              )}
            </strong>

            <span>
              ${escapeHtml(
                entry.skillName
              )}
              — ${entry.total}
            </span>

            <small>
              ${time}
              ${
                entry.source === "gm"
                  ? " • Mestre"
                  : " • Jogador"
              }
            </small>
          </div>
        `;
      })
      .join("");
}

// ============================================================
// DESCOBRIR NOME DA PERÍCIA NO RESULTADO
// ============================================================

function extractSkillName(
  result: RollResult,
  fallback?: string
) {
  const groups =
    result.result?.groups ?? [];

  const skillFromDescription =
    groups
      .map(
        (group) =>
          group.description
      )
      .find(
        (description) =>
          typeof description ===
            "string" &&
          description.trim().length >
            0
      );

  if (skillFromDescription) {
    return getOriginalSkillName(
      skillFromDescription
    );
  }

  const notation =
    result.result?.diceNotation ??
    "";

  if (notation.includes("#")) {
    const description =
      notation
        .split("#")
        .slice(1)
        .join("#")
        .trim();

    return getOriginalSkillName(
      description
    );
  }

  if (fallback) {
    return fallback;
  }

  return "Teste";
}

// ============================================================
// START
// ============================================================

async function start() {
  const playerName =
    await OBR.player.getName();

  const playerRole =
    await OBR.player.getRole();

  const playerId =
    await OBR.player.getId();

  console.log(
    "RPG Calúnia iniciado."
  );

  console.log(
    "Jogador:",
    playerName
  );

  console.log(
    "Função:",
    playerRole
  );

  console.log(
    "Player ID:",
    playerId
  );

  // ==========================================================
  // RESULTADOS DO DICE+
  // ==========================================================

  OBR.broadcast.onMessage(
    `${EXTENSION_ID}/roll-result`,
    (event) => {
      const result =
        event.data as RollResult;

      console.log(
        "Resultado recebido:",
        result
      );

      if (
        processedRolls.has(
          result.rollId
        )
      ) {
        console.log(
          "Resultado duplicado ignorado:",
          result.rollId
        );

        return;
      }

      processedRolls.add(
        result.rollId
      );

      const fallbackSkill =
        pendingRolls.get(
          result.rollId
        );

      const skillName =
        extractSkillName(
          result,
          fallbackSkill
        );

      const total =
        result.result?.totalValue;

      if (
        total === undefined
      ) {
        return;
      }

      // ========================================================
      // RESULTADO DO MESTRE
      // ========================================================

      if (
        playerRole === "GM" &&
        result.rollTarget ===
          "gm_only"
      ) {
        const source =
          pendingRollPlayers.has(
            result.rollId
          )
            ? "gm"
            : "player";

        addGmHistory({
          playerId:
            result.playerId,

          playerName:
            result.playerName,

          skillName,

          total,

          source,

          timestamp:
            Date.now(),
        });

        renderGmHistory();

        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          );

        if (status) {
          status.textContent =
            `${result.playerName} — ${skillName} — ${total}`;
        }
      }

      // ========================================================
      // RESULTADO PARA O JOGADOR
      // ========================================================

      if (
        playerRole !== "GM"
      ) {
        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          );

        if (status) {
          status.textContent =
            `${result.playerName} — ${skillName} — ${total}`;
        }
      }

      pendingRolls.delete(
        result.rollId
      );

      pendingRollPlayers.delete(
        result.rollId
      );

      if (
        processedRolls.size >
        100
      ) {
        const oldest =
          processedRolls
            .values()
            .next()
            .value;

        if (oldest) {
          processedRolls.delete(
            oldest
          );
        }
      }
    }
  );

  // ==========================================================
  // PEDIDO RECEBIDO PELO JOGADOR
  // ==========================================================

  OBR.broadcast.onMessage(
    LOCAL_REQUEST_CHANNEL,
    async (event) => {
      const request =
        event.data as TestRequest;

      console.log(
        "Pedido recebido:",
        request
      );

      await clearBadge();

      renderPlayerInterface(
        playerName,
        request,
        playerId
      );
    }
  );

  // ==========================================================
  // MODO MESTRE
  // ==========================================================

  if (
    playerRole === "GM"
  ) {
    currentPlayers =
      await OBR.party.getPlayers();

    renderGmInterface(
      playerName,
      currentPlayers
    );

    OBR.party.onChange(
      (players) => {
        currentPlayers =
          players;

        renderGmInterface(
          playerName,
          currentPlayers
        );
      }
    );

    return;
  }

  // ==========================================================
  // MODO JOGADOR
  // ==========================================================

  const metadata =
    await OBR.player.getMetadata();

  const storedPendingRequest =
    metadata[
      METADATA_KEY
    ] as
      | TestRequest
      | undefined;

  renderPlayerInterface(
    playerName,
    storedPendingRequest ?? null,
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
        OBR.action.setBadgeText(
          "!"
        );

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
// INTERFACE DO MESTRE
// ============================================================

function renderGmInterface(
  playerName: string,
  players: any[]
) {
  const playerCards =
    players
      .map((player) => {
        const skillRows =
          skills
            .map((skill) => {
              return `
                <div class="gm-skill-row">

                  <span>
                    ${escapeHtml(
                      skill.name
                    )}
                    +${skill.bonus}
                  </span>

                  <div>

                    <button
                      class="request-button"
                      data-player-id="${player.id}"
                      data-player-name="${escapeHtml(player.name)}"
                      data-skill="${skill.name}"
                      data-bonus="${skill.bonus}"
                    >
                      PEDIR
                    </button>

                    <button
                      class="gm-roll-button"
                      data-player-id="${player.id}"
                      data-player-name="${escapeHtml(player.name)}"
                      data-skill="${skill.name}"
                      data-bonus="${skill.bonus}"
                    >
                      ROLAR
                    </button>

                  </div>

                </div>
              `;
            })
            .join("");

        return `
          <div class="player-card">

            <h3>
              ${escapeHtml(
                player.name
              )}
            </h3>

            ${skillRows}

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
        <strong>
          ${escapeHtml(
            playerName
          )}
        </strong>
      </p>

      <p>
        Função:
        <strong>Mestre</strong>
      </p>

      <hr />

      <h2>Jogadores</h2>

      ${
        players.length > 0
          ? playerCards
          : `
            <p>
              Nenhum jogador conectado.
            </p>
          `
      }

      <hr />

      <h2>Último resultado</h2>

      <p id="status">
        Aguardando...
      </p>

      <hr />

      <div class="history-header">

        <h2>
          Histórico secreto
        </h2>

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
          const targetPlayerId =
            button.dataset.playerId!;

          const targetPlayerName =
            button.dataset.playerName!;

          const skillName =
            button.dataset.skill!;

          const bonus =
            Number(
              button.dataset.bonus
            );

          const request:
            TestRequest = {
            targetPlayerId,

            targetPlayerName,

            skillName,

            bonus,

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
                destination:
                  "ALL",
              }
            );

            status.textContent =
              `Teste de ${skillName} enviado para ${targetPlayerName}.`;

          } catch (error) {
            console.error(
              "Erro ao enviar pedido:",
              error
            );

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

          const bonus =
            Number(
              button.dataset.bonus
            );

          const status =
            document.querySelector<HTMLParagraphElement>(
              "#status"
            )!;

          const rollId =
            createRollId();

          // Guarda o atributo da rolagem.
          pendingRolls.set(
            rollId,
            skillName
          );

          // Guarda o jogador que o Mestre escolheu.
          pendingRollPlayers.set(
            rollId,
            targetPlayerId
          );

          status.textContent =
            `Rolando ${skillName} de ${targetPlayerName}...`;

          console.log(
            "Rolagem do Mestre:",
            {
              rollId,
              playerId:
                targetPlayerId,
              playerName:
                targetPlayerName,
              skillName,
              bonus,

              // IMPORTANTE:
              // não colocamos #/descrição aqui.
              diceNotation:
                `1d20+${bonus}`,
            }
          );

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

                // Notação simples e segura.
                diceNotation:
                  `1d20+${bonus}`,

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

          } catch (error) {
            console.error(
              "Erro ao rolar pelo jogador:",
              error
            );

            pendingRolls.delete(
              rollId
            );

            pendingRollPlayers.delete(
              rollId
            );

            status.textContent =
              "Erro ao rolar pelo jogador.";
          }
        }
      );
    });

  // ==========================================================
  // LIMPAR HISTÓRICO
  // ==========================================================

  document
    .querySelector<HTMLButtonElement>(
      "#clear-history"
    )
    ?.addEventListener(
      "click",
      () => {
        clearGmHistory();

        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          );

        if (status) {
          status.textContent =
            "Histórico limpo.";
        }
      }
    );
}

// ============================================================
// INTERFACE DO JOGADOR
// ============================================================

function renderPlayerInterface(
  playerName: string,
  pendingRequest:
    | TestRequest
    | null,
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
        <strong>
          ${escapeHtml(
            playerName
          )}
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

              <p>
                Bônus:
                +${pendingRequest.bonus}
              </p>

              <button
                id="requested-roll"
              >
                ROLAR
              </button>

            </div>
          `
          : ""
      }

      <hr />

      <h2>
        Meus testes
      </h2>

      ${skillButtons}

      <p id="status"></p>

    </div>
  `;

  // ==========================================================
  // ROLAR TESTE SOLICITADO
  // ==========================================================

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

        const diceSkillName =
          getDiceSkillName(
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

              rollTarget:
                "gm_only",

              diceNotation:
                `1d20+${pendingRequest.bonus} # ${diceSkillName}`,

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

        } catch (error) {
          console.error(
            "Erro ao realizar teste solicitado:",
            error
          );

          pendingRolls.delete(
            rollId
          );

          status.textContent =
            "Erro ao realizar o teste.";
        }
      }
    );
  }

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

          const bonus =
            Number(
              button.dataset.bonus
            );

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

          const diceSkillName =
            getDiceSkillName(
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

                rollTarget:
                  "gm_only",

                diceNotation:
                  `1d20+${bonus} # ${diceSkillName}`,

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

          } catch (error) {
            console.error(
              "Erro ao enviar rolagem:",
              error
            );

            pendingRolls.delete(
              rollId
            );

            status.textContent =
              "Erro ao enviar rolagem.";
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
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

OBR.onReady(start);