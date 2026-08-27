import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "rpg-calunia";

const TEST_REQUEST_CHANNEL =
  "rpg-calunia/test-request";

const TEST_CANCEL_CHANNEL =
  "rpg-calunia/test-cancel";

const TEST_COMPLETED_CHANNEL =
  "rpg-calunia/test-completed";

const LOCAL_REQUEST_CHANNEL =
  "rpg-calunia/show-test-request";

const LOCAL_CANCEL_CHANNEL =
  "rpg-calunia/show-test-cancel";

const METADATA_KEY =
  "rpg-calunia/pending-test";

const HISTORY_STORAGE_PREFIX =
  "rpg-calunia/gm-history";

const PENDING_STORAGE_PREFIX =
  "rpg-calunia/pending-requests";

const SIZE_STORAGE_PREFIX =
  "rpg-calunia/popover-size";

const skills = [
  {
    name: "Raciocínio",
    icon: "🧠",
  },
  {
    name: "Investigação",
    icon: "🔎",
  },
  {
    name: "Percepção",
    icon: "👁️",
  },
  {
    name: "Memória",
    icon: "🧩",
  },
  {
    name: "Sangue-Frio",
    icon: "🩸",
  },
  {
    name: "Vontade",
    icon: "🔥",
  },
  {
    name: "Concentração",
    icon: "🎯",
  },
  {
    name: "Manipulação",
    icon: "🎭",
  },
  {
    name: "Leitura",
    icon: "📖",
  },
];

type TestRequest = {
  requestId: string;
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  requesterName: string;
  timestamp: number;
};

type PendingRequest = TestRequest;

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

type PopoverSize = {
  width: number;
  height: number;
};

const DEFAULT_SIZE: PopoverSize = {
  width: 420,
  height: 600,
};

const MIN_SIZE: PopoverSize = {
  width: 300,
  height: 400,
};

const MAX_SIZE: PopoverSize = {
  width: 650,
  height: 900,
};

const pendingRolls =
  new Map<string, string>();

const pendingRollPlayers =
  new Map<string, string>();

const pendingRollRequestIds =
  new Map<string, string>();

const processedRolls =
  new Set<string>();

let currentRoomId = "";

const expandedPlayers =
  new Set<string>();

let gmActiveTab:
  | "tests"
  | "history" = "tests";

let playerActiveTab:
  | "tests"
  | "about" = "tests";

// ============================================================
// ID
// ============================================================

function createId(prefix: string) {
  return (
    `${prefix}_${Date.now()}_` +
    Math.random()
      .toString(36)
      .substring(2, 9)
  );
}

// ============================================================
// HTML
// ============================================================

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

// ============================================================
// BADGE
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
// REDIMENSIONAMENTO
// ============================================================

function getSizeStorageKey() {
  return (
    `${SIZE_STORAGE_PREFIX}:` +
    currentRoomId
  );
}

function getSavedSize(): PopoverSize {
  try {
    const raw =
      localStorage.getItem(
        getSizeStorageKey()
      );

    if (!raw) {
      return DEFAULT_SIZE;
    }

    const parsed =
      JSON.parse(raw);

    if (
      typeof parsed.width !==
        "number" ||
      typeof parsed.height !==
        "number"
    ) {
      return DEFAULT_SIZE;
    }

    return clampSize({
      width: parsed.width,
      height: parsed.height,
    });
  } catch {
    return DEFAULT_SIZE;
  }
}

function saveSize(
  size: PopoverSize
) {
  localStorage.setItem(
    getSizeStorageKey(),
    JSON.stringify(size)
  );
}

function clampSize(
  size: PopoverSize
): PopoverSize {
  return {
    width: Math.min(
      Math.max(
        size.width,
        MIN_SIZE.width
      ),
      MAX_SIZE.width
    ),

    height: Math.min(
      Math.max(
        size.height,
        MIN_SIZE.height
      ),
      MAX_SIZE.height
    ),
  };
}

async function applySavedPopoverSize() {
  const size =
    getSavedSize();

  try {
    await OBR.action.setWidth(
      size.width
    );

    await OBR.action.setHeight(
      size.height
    );
  } catch (error) {
    console.error(
      "Erro ao aplicar tamanho:",
      error
    );
  }
}

function setupResizeHandle() {
  const handle =
    document.querySelector<HTMLDivElement>(
      "#resize-handle"
    );

  if (!handle) {
    return;
  }

  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth =
    DEFAULT_SIZE.width;
  let startHeight =
    DEFAULT_SIZE.height;

  handle.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();

      const size =
        getSavedSize();

      resizing = true;

      startX =
        event.clientX;

      startY =
        event.clientY;

      startWidth =
        size.width;

      startHeight =
        size.height;

      handle.setPointerCapture(
        event.pointerId
      );

      document.body.classList.add(
        "resizing"
      );
    }
  );

  handle.addEventListener(
    "pointermove",
    async (event) => {
      if (!resizing) {
        return;
      }

      const nextSize =
        clampSize({
          width:
            startWidth +
            (event.clientX -
              startX),

          height:
            startHeight +
            (event.clientY -
              startY),
        });

      saveSize(nextSize);

      try {
        await OBR.action.setWidth(
          nextSize.width
        );

        await OBR.action.setHeight(
          nextSize.height
        );
      } catch (error) {
        console.error(
          "Erro ao redimensionar:",
          error
        );
      }
    }
  );

  handle.addEventListener(
    "pointerup",
    (event) => {
      resizing = false;

      try {
        handle.releasePointerCapture(
          event.pointerId
        );
      } catch {
        // Nada.
      }

      document.body.classList.remove(
        "resizing"
      );
    }
  );

  handle.addEventListener(
    "pointercancel",
    () => {
      resizing = false;

      document.body.classList.remove(
        "resizing"
      );
    }
  );
}

// ============================================================
// HISTÓRICO
// ============================================================

function getHistoryKey() {
  return (
    `${HISTORY_STORAGE_PREFIX}:` +
    currentRoomId
  );
}

function getGmHistory(): HistoryEntry[] {
  try {
    const raw =
      localStorage.getItem(
        getHistoryKey()
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function saveGmHistory(
  history: HistoryEntry[]
) {
  localStorage.setItem(
    getHistoryKey(),
    JSON.stringify(history)
  );
}

function addGmHistory(
  entry: HistoryEntry
) {
  const history =
    getGmHistory();

  history.unshift(entry);

  saveGmHistory(
    history.slice(0, 100)
  );
}

function clearGmHistory() {
  localStorage.removeItem(
    getHistoryKey()
  );

  renderGmHistory();
}

function renderGmHistory() {
  const container =
    document.querySelector<HTMLDivElement>(
      "#history"
    );

  if (!container) {
    return;
  }

  const history =
    getGmHistory();

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📜</div>
        <strong>Nenhum teste ainda</strong>
        <span>
          Os resultados secretos aparecerão aqui.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    history
      .map((entry) => {
        const time =
          new Date(
            entry.timestamp
          ).toLocaleTimeString(
            "pt-BR",
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );

        return `
          <div class="history-entry">

            <div class="history-main">

              <div class="history-player">
                <span class="history-dice">
                  🎲
                </span>

                <div>
                  <strong>
                    ${escapeHtml(
                      entry.playerName
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      entry.skillName
                    )}
                  </span>
                </div>
              </div>

              <div class="history-result">
                ${entry.total}
              </div>

            </div>

            <small>
              ${time}
              • ${
                entry.source === "gm"
                  ? "Mestre"
                  : "Jogador"
              }
            </small>

          </div>
        `;
      })
      .join("");
}

// ============================================================
// PEDIDOS
// ============================================================

function getPendingRequestsKey() {
  return (
    `${PENDING_STORAGE_PREFIX}:` +
    currentRoomId
  );
}

function getPendingRequests():
  PendingRequest[] {
  try {
    const raw =
      localStorage.getItem(
        getPendingRequestsKey()
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function savePendingRequests(
  requests: PendingRequest[]
) {
  localStorage.setItem(
    getPendingRequestsKey(),
    JSON.stringify(requests)
  );
}

function addPendingRequest(
  request: PendingRequest
) {
  const requests =
    getPendingRequests();

  const alreadyExists =
    requests.some(
      (item) =>
        item.targetPlayerId ===
          request.targetPlayerId &&
        item.skillName ===
          request.skillName
    );

  if (alreadyExists) {
    return false;
  }

  requests.push(request);

  savePendingRequests(
    requests
  );

  return true;
}

function removePendingRequest(
  requestId: string
) {
  const requests =
    getPendingRequests();

  savePendingRequests(
    requests.filter(
      (request) =>
        request.requestId !==
        requestId
    )
  );
}

function findPendingRequestByPlayerAndSkill(
  playerId: string,
  skillName: string
) {
  return getPendingRequests().find(
    (request) =>
      request.targetPlayerId ===
        playerId &&
      request.skillName ===
        skillName
  );
}

// ============================================================
// SKILLS
// ============================================================

function getSkill(
  skillName: string
) {
  return skills.find(
    (skill) =>
      skill.name === skillName
  );
}

function normalizeSkillName(
  value: string
) {
  const normalized =
    value
      .replaceAll("-", " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const found =
    skills.find(
      (skill) =>
        skill.name
          .replaceAll("-", " ")
          .toLowerCase() ===
        normalized
    );

  return (
    found?.name ??
    value
  );
}

// ============================================================
// RESULTADO
// ============================================================

function extractSkillName(
  result: RollResult,
  fallback?: string
) {
  const groups =
    result.result?.groups ?? [];

  const description =
    groups
      .map(
        (group) =>
          group.description
      )
      .find(
        (value) =>
          typeof value ===
            "string" &&
          value.trim().length >
            0
      );

  if (description) {
    return normalizeSkillName(
      description
    );
  }

  const notation =
    result.result?.diceNotation ??
    "";

  if (
    notation.includes("#")
  ) {
    return normalizeSkillName(
      notation
        .split("#")
        .slice(1)
        .join("#")
        .trim()
    );
  }

  return (
    fallback ??
    "Teste"
  );
}

function renderResultCard(
  playerName: string,
  skillName: string,
  total: number
) {
  const container =
    document.querySelector<HTMLDivElement>(
      "#result-card"
    );

  if (!container) {
    return;
  }

  const skill =
    getSkill(skillName);

  container.innerHTML = `
    <div class="result-card">

      <div class="result-icon-big">
        ${
          skill?.icon ??
          "🎲"
        }
      </div>

      <div class="result-content">

        <strong>
          ${escapeHtml(
            skillName
          )}
        </strong>

        <span>
          ${escapeHtml(
            playerName
          )}
        </span>

      </div>

      <div class="result-total">
        ${total}
      </div>

    </div>
  `;
}

// ============================================================
// ABAS DO MESTRE
// ============================================================

function renderGmTabs() {
  return `
    <div class="tabs">

      <button
        class="tab-button ${
          gmActiveTab ===
          "tests"
            ? "active"
            : ""
        }"
        data-tab="tests"
      >
        🎲 Testes
      </button>

      <button
        class="tab-button ${
          gmActiveTab ===
          "history"
            ? "active"
            : ""
        }"
        data-tab="history"
      >
        📜 Histórico
      </button>

    </div>
  `;
}

// ============================================================
// MESTRE
// ============================================================

function renderGmInterface(
  playerName: string,
  players: any[]
) {
  const pending =
    getPendingRequests();

  const playerCards =
    players
      .map((player) => {
        const isExpanded =
          expandedPlayers.has(
            player.id
          );

        const pendingCount =
          pending.filter(
            (request) =>
              request.targetPlayerId ===
              player.id
          ).length;

        const skillRows =
          skills
            .map((skill) => {
              const pendingRequest =
                findPendingRequestByPlayerAndSkill(
                  player.id,
                  skill.name
                );

              return `
                <div
                  class="gm-skill-row"
                >

                  <div class="skill-info">

                    <span class="skill-icon">
                      ${skill.icon}
                    </span>

                    <span>
                      ${escapeHtml(
                        skill.name
                      )}
                    </span>

                  </div>

                  <div class="skill-actions">

                    ${
                      pendingRequest
                        ? `
                          <button
                            class="cancel-request-button"
                            data-request-id="${pendingRequest.requestId}"
                          >
                            CANCELAR
                          </button>
                        `
                        : `
                          <button
                            class="request-button"
                            data-player-id="${player.id}"
                            data-player-name="${escapeHtml(player.name)}"
                            data-skill="${escapeHtml(skill.name)}"
                          >
                            PEDIR
                          </button>
                        `
                    }

                    <button
                      class="gm-roll-button"
                      data-player-id="${player.id}"
                      data-player-name="${escapeHtml(player.name)}"
                      data-skill="${escapeHtml(skill.name)}"
                    >
                      ROLAR
                    </button>

                  </div>

                </div>
              `;
            })
            .join("");

        return `
          <div
            class="player-accordion ${
              isExpanded
                ? "expanded"
                : ""
            }"
          >

            <button
              class="player-header"
              data-player-toggle="${player.id}"
            >

              <span class="player-chevron">
                ${isExpanded ? "⌄" : "›"}
              </span>

              <span class="player-avatar">
                ${getPlayerInitial(
                  player.name
                )}
              </span>

              <span class="player-name-block">

                <strong>
                  ${escapeHtml(
                    player.name
                  )}
                </strong>

                <small>
                  ${pendingCount > 0
                    ? `${pendingCount} pedido pendente`
                    : "Sem pedidos pendentes"}
                </small>

              </span>

              ${
                pendingCount > 0
                  ? `
                    <span class="pending-dot">
                      ${pendingCount}
                    </span>
                  `
                  : ""
              }

            </button>

            ${
              isExpanded
                ? `
                  <div class="player-content">

                    ${skillRows}

                  </div>
                `
                : ""
            }

          </div>
        `;
      })
      .join("");

  document.querySelector<HTMLDivElement>(
    "#app"
  )!.innerHTML = `
    <div class="app">

      <header class="app-header">

        <div>
          <div class="eyebrow">
            MODO MESTRE
          </div>

          <h1>
            RPG Calúnia
          </h1>

          <div class="header-player">
            👤 ${escapeHtml(
              playerName
            )}
          </div>
        </div>

      </header>

      ${renderGmTabs()}

      ${
        gmActiveTab ===
        "tests"
          ? `
            <section class="tab-content">

              <div class="section-heading">

                <div>
                  <h2>
                    Jogadores
                  </h2>

                  <p>
                    Clique na seta para abrir os testes.
                  </p>
                </div>

                <span class="player-count">
                  ${players.length}
                </span>

              </div>

              ${
                players.length > 0
                  ? playerCards
                  : `
                    <div class="empty-state">
                      <div class="empty-icon">
                        👥
                      </div>

                      <strong>
                        Nenhum jogador
                      </strong>

                      <span>
                        Os jogadores aparecerão aqui quando entrarem na sala.
                      </span>
                    </div>
                  `
              }

              <section class="latest-section">

                <div class="section-heading">
                  <div>
                    <h2>
                      Último resultado
                    </h2>
                  </div>
                </div>

                <div id="result-card">
                </div>

                <p id="status">
                  Aguardando...
                </p>

              </section>

            </section>
          `
          : `
            <section class="tab-content">

              <div class="section-heading">
                <div>
                  <h2>
                    Histórico secreto
                  </h2>

                  <p>
                    Somente você consegue ver estes resultados.
                  </p>
                </div>

                <button
                  id="clear-history"
                  class="secondary-button"
                >
                  LIMPAR
                </button>
              </div>

              <div id="history">
              </div>

            </section>
          `
      }

    </div>

    <div
      id="resize-handle"
      title="Arraste para redimensionar"
    ></div>
  `;

  // ==========================================================
  // REDIMENSIONAMENTO
  // ==========================================================

  setupResizeHandle();

  // ==========================================================
  // TROCA DE ABA
  // ==========================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      ".tab-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const tab =
            button.dataset.tab;

          if (
            tab === "tests" ||
            tab === "history"
          ) {
            gmActiveTab =
              tab;
          }

          renderGmInterface(
            playerName,
            players
          );
        }
      );
    });

  // ==========================================================
  // ABRIR/FECHAR JOGADOR
  // ==========================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-player-toggle]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const playerId =
            button.dataset
              .playerToggle!;

          if (
            expandedPlayers.has(
              playerId
            )
          ) {
            expandedPlayers.delete(
              playerId
            );
          } else {
            expandedPlayers.add(
              playerId
            );
          }

          renderGmInterface(
            playerName,
            players
          );
        }
      );
    });

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
        async (event) => {
          event.stopPropagation();

          const targetPlayerId =
            button.dataset
              .playerId!;

          const targetPlayerName =
            button.dataset
              .playerName!;

          const skillName =
            button.dataset
              .skill!;

          if (
            findPendingRequestByPlayerAndSkill(
              targetPlayerId,
              skillName
            )
          ) {
            return;
          }

          const request:
            TestRequest = {
            requestId:
              createId(
                "request"
              ),

            targetPlayerId,

            targetPlayerName,

            skillName,

            requesterName:
              playerName,

            timestamp:
              Date.now(),
          };

          if (
            !addPendingRequest(
              request
            )
          ) {
            return;
          }

          try {
            await OBR.broadcast.sendMessage(
              TEST_REQUEST_CHANNEL,
              request,
              {
                destination:
                  "ALL",
              }
            );

            const status =
              document.querySelector<HTMLParagraphElement>(
                "#status"
              );

            if (status) {
              status.textContent =
                `Teste de ${skillName} enviado para ${targetPlayerName}.`;
            }

            renderGmInterface(
              playerName,
              players
            );
          } catch (error) {
            console.error(
              "Erro ao enviar pedido:",
              error
            );

            removePendingRequest(
              request.requestId
            );

            renderGmInterface(
              playerName,
              players
            );
          }
        }
      );
    });

  // ==========================================================
  // CANCELAR
  // ==========================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      ".cancel-request-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async (event) => {
          event.stopPropagation();

          const requestId =
            button.dataset
              .requestId!;

          const request =
            getPendingRequests().find(
              (item) =>
                item.requestId ===
                requestId
            );

          if (!request) {
            return;
          }

          removePendingRequest(
            requestId
          );

          try {
            await OBR.broadcast.sendMessage(
              TEST_CANCEL_CHANNEL,
              request,
              {
                destination:
                  "ALL",
              }
            );

            renderGmInterface(
              playerName,
              players
            );
          } catch (error) {
            console.error(
              "Erro ao cancelar:",
              error
            );

            addPendingRequest(
              request
            );

            renderGmInterface(
              playerName,
              players
            );
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
        async (event) => {
          event.stopPropagation();

          const targetPlayerId =
            button.dataset
              .playerId!;

          const targetPlayerName =
            button.dataset
              .playerName!;

          const skillName =
            button.dataset
              .skill!;

          const status =
            document.querySelector<HTMLParagraphElement>(
              "#status"
            );

          if (status) {
            status.textContent =
              `🎲 Rolando ${skillName} de ${targetPlayerName}...`;
          }

          const rollId =
            createId("roll");

          pendingRolls.set(
            rollId,
            skillName
          );

          pendingRollPlayers.set(
            rollId,
            targetPlayerId
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
          } catch (error) {
            console.error(
              "Erro ao rolar:",
              error
            );

            pendingRolls.delete(
              rollId
            );

            pendingRollPlayers.delete(
              rollId
            );

            if (status) {
              status.textContent =
                "Não foi possível rolar.";
            }
          }
        }
      );
    });

  // ==========================================================
  // HISTÓRICO
  // ==========================================================

  document
    .querySelector<HTMLButtonElement>(
      "#clear-history"
    )
    ?.addEventListener(
      "click",
      () => {
        clearGmHistory();

        const history =
          document.querySelector(
            "#history"
          );

        if (history) {
          renderGmHistory();
        }
      }
    );

  renderGmHistory();
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
  const skillButtons =
    skills
      .map(
        (skill) => `
          <button
            class="skill-button"
            data-skill="${escapeHtml(
              skill.name
            )}"
          >
            <span class="skill-icon">
              ${skill.icon}
            </span>

            <span class="skill-label">
              ${escapeHtml(
                skill.name
              )}
            </span>

            <span class="skill-arrow">
              →
            </span>
          </button>
        `
      )
      .join("");

  document.querySelector<HTMLDivElement>(
    "#app"
  )!.innerHTML = `
    <div class="app">

      <header class="app-header">

        <div>
          <div class="eyebrow">
            MODO JOGADOR
          </div>

          <h1>
            RPG Calúnia
          </h1>

          <div class="header-player">
            👤 ${escapeHtml(
              playerName
            )}
          </div>
        </div>

      </header>

      <div class="tabs">

        <button
          class="tab-button ${
            playerActiveTab ===
            "tests"
              ? "active"
              : ""
          }"
          data-player-tab="tests"
        >
          🎲 Testes
        </button>

        <button
          class="tab-button ${
            playerActiveTab ===
            "about"
              ? "active"
              : ""
          }"
          data-player-tab="about"
        >
          ℹ️ Ajuda
        </button>

      </div>

      ${
        playerActiveTab ===
        "tests"
          ? `
            <section class="tab-content">

              ${
                pendingRequest
                  ? `
                    <div class="pending-test">

                      <div class="pending-top">
                        <span>
                          🔔
                        </span>

                        <span>
                          TESTE SOLICITADO
                        </span>
                      </div>

                      <p>
                        O Mestre solicitou:
                      </p>

                      <h3>
                        ${
                          getSkill(
                            pendingRequest.skillName
                          )?.icon ??
                          "🎲"
                        }

                        ${escapeHtml(
                          pendingRequest.skillName
                        )}
                      </h3>

                      <button
                        id="requested-roll"
                        class="primary-action"
                      >
                        🎲 ROLAR TESTE
                      </button>

                    </div>
                  `
                  : ""
              }

              <div class="section-heading">

                <div>
                  <h2>
                    Meus testes
                  </h2>

                  <p>
                    Todos os testes usam 1d20.
                  </p>
                </div>

              </div>

              <div class="skill-list">
                ${skillButtons}
              </div>

              <div id="result-card">
              </div>

              <p id="status">
              </p>

            </section>
          `
          : `
            <section class="tab-content">

              <div class="help-card">

                <div class="help-icon">
                  🎲
                </div>

                <h2>
                  Como funciona?
                </h2>

                <p>
                  Escolha uma perícia para
                  realizar um teste de D20.
                </p>

                <p>
                  Quando o Mestre solicitar
                  um teste, ele aparecerá
                  destacado aqui.
                </p>

                <p>
                  Alguns testes podem ser
                  realizados secretamente
                  pelo Mestre.
                </p>

              </div>

            </section>
          `
      }

    </div>

    <div
      id="resize-handle"
      title="Arraste para redimensionar"
    ></div>
  `;

  // ==========================================================
  // REDIMENSIONAMENTO
  // ==========================================================

  setupResizeHandle();

  // ==========================================================
  // TABS
  // ==========================================================

  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-player-tab]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const tab =
            button.dataset
              .playerTab;

          if (
            tab === "tests" ||
            tab === "about"
          ) {
            playerActiveTab =
              tab;
          }

          renderPlayerInterface(
            playerName,
            pendingRequest,
            playerId
          );
        }
      );
    });

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

        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          );

        if (status) {
          status.textContent =
            `🎲 Rolando ${pendingRequest.skillName}...`;
        }

        const rollId =
          createId("roll");

        pendingRolls.set(
          rollId,
          pendingRequest.skillName
        );

        pendingRollRequestIds.set(
          rollId,
          pendingRequest.requestId
        );

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

          await OBR.broadcast.sendMessage(
            TEST_COMPLETED_CHANNEL,
            {
              requestId:
                pendingRequest.requestId,

              playerId,
            },
            {
              destination:
                "ALL",
            }
          );

          renderPlayerInterface(
            playerName,
            null,
            playerId
          );
        } catch (error) {
          console.error(
            "Erro no teste solicitado:",
            error
          );

          pendingRolls.delete(
            rollId
          );

          pendingRollRequestIds.delete(
            rollId
          );

          if (status) {
            status.textContent =
              "Não foi possível realizar o teste.";
          }
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

          const status =
            document.querySelector<HTMLParagraphElement>(
              "#status"
            );

          if (status) {
            status.textContent =
              `🎲 Rolando ${skillName}...`;
          }

          const rollId =
            createId("roll");

          pendingRolls.set(
            rollId,
            skillName
          );

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
          } catch (error) {
            console.error(
              "Erro na rolagem:",
              error
            );

            pendingRolls.delete(
              rollId
            );

            if (status) {
              status.textContent =
                "Não foi possível rolar.";
            }
          }
        }
      );
    });
}

// ============================================================
// AUXILIARES
// ============================================================

function getPlayerInitial(
  name: string
) {
  const first =
    name.trim().charAt(0);

  return first
    ? first.toUpperCase()
    : "?";
}

// ============================================================
// RESULTADOS / START
// ============================================================

async function start() {
  const playerName =
    await OBR.player.getName();

  const playerRole =
    await OBR.player.getRole();

  const playerId =
    await OBR.player.getId();

  currentRoomId =
    OBR.room.id;

  await applySavedPopoverSize();

  console.log(
    "RPG Calúnia iniciado."
  );

  console.log(
    "Room:",
    currentRoomId
  );

  console.log(
    "Jogador:",
    playerName
  );

  console.log(
    "Função:",
    playerRole
  );

  // ==========================================================
  // RESULTADO DO DICE+
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

      const fallback =
        pendingRolls.get(
          result.rollId
        );

      const skillName =
        extractSkillName(
          result,
          fallback
        );

      const total =
        result.result?.totalValue;

      if (
        total === undefined
      ) {
        return;
      }

      // --------------------------------------------------------
      // MESTRE
      // --------------------------------------------------------

      if (
        playerRole === "GM" &&
        result.rollTarget ===
          "gm_only"
      ) {
        const requestId =
          pendingRollRequestIds.get(
            result.rollId
          );

        const source =
          requestId
            ? "player"
            : "gm";

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

        if (requestId) {
          removePendingRequest(
            requestId
          );
        }

        renderGmHistory();

        renderResultCard(
          result.playerName,
          skillName,
          total
        );

        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          );

        if (status) {
          status.innerHTML =
            `
              <span class="success-status">
                ✓ Teste realizado
              </span>
            `;
        }
      }

      // --------------------------------------------------------
      // JOGADOR
      // --------------------------------------------------------

      if (
        playerRole !== "GM"
      ) {
        renderResultCard(
          result.playerName,
          skillName,
          total
        );

        const status =
          document.querySelector<HTMLParagraphElement>(
            "#status"
          );

        if (status) {
          status.innerHTML =
            `
              <span class="success-status">
                ✓ Teste realizado
              </span>
            `;
        }
      }

      pendingRolls.delete(
        result.rollId
      );

      pendingRollPlayers.delete(
        result.rollId
      );

      pendingRollRequestIds.delete(
        result.rollId
      );
    }
  );

  // ==========================================================
  // PEDIDO LOCAL
  // ==========================================================

  OBR.broadcast.onMessage(
    LOCAL_REQUEST_CHANNEL,
    async (event) => {
      const request =
        event.data as TestRequest;

      await clearBadge();

      playerActiveTab =
        "tests";

      renderPlayerInterface(
        playerName,
        request,
        playerId
      );
    }
  );

  // ==========================================================
  // CANCELAMENTO LOCAL
  // ==========================================================

  OBR.broadcast.onMessage(
    LOCAL_CANCEL_CHANNEL,
    async () => {
      await clearBadge();

      renderPlayerInterface(
        playerName,
        null,
        playerId
      );

      const status =
        document.querySelector<HTMLParagraphElement>(
          "#status"
        );

      if (status) {
        status.textContent =
          "O Mestre cancelou o teste.";
      }
    }
  );

  // ==========================================================
  // MESTRE
  // ==========================================================

  if (
    playerRole === "GM"
  ) {
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

    OBR.broadcast.onMessage(
      TEST_COMPLETED_CHANNEL,
      (event) => {
        const data =
          event.data as {
            requestId: string;
            playerId: string;
          };

        removePendingRequest(
          data.requestId
        );

        renderGmInterface(
          playerName,
          players
        );
      }
    );

    return;
  }

  // ==========================================================
  // JOGADOR
  // ==========================================================

  const metadata =
    await OBR.player.getMetadata();

  const storedRequest =
    metadata[
      METADATA_KEY
    ] as
      | TestRequest
      | undefined;

  renderPlayerInterface(
    playerName,
    storedRequest ?? null,
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

OBR.onReady(start);