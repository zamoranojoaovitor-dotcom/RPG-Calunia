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

const PENDING_STORAGE_PREFIX =
  "rpg-calunia/pending-requests";

const SIZE_STORAGE_PREFIX =
  "rpg-calunia/popover-size";

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
let currentPlayers: any[] = [];

function createId(prefix: string) {
  return (
    `${prefix}_${Date.now()}_` +
    Math.random()
      .toString(36)
      .substring(2, 9)
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

    const parsed = JSON.parse(raw);

    if (
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
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

function saveSize(size: PopoverSize) {
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
  let startWidth = DEFAULT_SIZE.width;
  let startHeight = DEFAULT_SIZE.height;

  handle.addEventListener(
    "pointerdown",
    async (event) => {
      event.preventDefault();

      const size =
        getSavedSize();

      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      startWidth = size.width;
      startHeight = size.height;

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

      const deltaX =
        event.clientX - startX;

      const deltaY =
        event.clientY - startY;

      const nextSize =
        clampSize({
          width:
            startWidth +
            deltaX,

          height:
            startHeight +
            deltaY,
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
        // Ignora caso o ponteiro já tenha sido liberado.
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

function addResizeHandle() {
  if (
    document.querySelector(
      "#resize-handle"
    )
  ) {
    return;
  }

  const handle =
    document.createElement(
      "div"
    );

  handle.id =
    "resize-handle";

  handle.setAttribute(
    "aria-label",
    "Redimensionar painel"
  );

  handle.title =
    "Arraste para redimensionar";

  document.body.appendChild(
    handle
  );

  setupResizeHandle();
}

function getHistoryKey() {
  return (
    `rpg-calunia/gm-history:` +
    currentRoomId
  );
}

function getPendingRequestsKey() {
  return (
    `${PENDING_STORAGE_PREFIX}:` +
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

function getPendingRequests(): PendingRequest[] {
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

  const filtered =
    requests.filter(
      (request) =>
        request.requestId !==
        requestId
    );

  savePendingRequests(
    filtered
  );
}

function findPendingRequestByPlayerAndSkill(
  playerId: string,
  skillName: string
) {
  return getPendingRequests()
    .find(
      (request) =>
        request.targetPlayerId ===
          playerId &&
        request.skillName ===
          skillName
    );
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
    container.innerHTML =
      "<p>Nenhum teste realizado ainda.</p>";

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
          typeof value === "string" &&
          value.trim().length > 0
      );

  if (description) {
    return normalizeSkillName(
      description
    );
  }

  const notation =
    result.result?.diceNotation ??
    "";

  if (notation.includes("#")) {
    return normalizeSkillName(
      notation
        .split("#")
        .slice(1)
        .join("#")
        .trim()
    );
  }

  if (fallback) {
    return fallback;
  }

  return "Teste";
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
        skill
          .replaceAll("-", " ")
          .toLowerCase() ===
        normalized
    );

  return found ?? value;
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

  container.innerHTML = `
    <div class="result-card">

      <div class="result-icon">
        🎲
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

  addResizeHandle();

  // ==========================================================
  // RESULTADOS DO DICE+
  // ==========================================================

  OBR.broadcast.onMessage(
    `${EXTENSION_ID}/roll-result`,
    (event) => {
      const result =
        event.data as RollResult;

      if (
        processedRolls.has(
          result.rollId
        )
      ) {
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
          status.textContent =
            `${result.playerName} — ${skillName} — ${total}`;
        }
      }

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
          status.textContent =
            "Teste realizado.";
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
  // PEDIDO RECEBIDO
  // ==========================================================

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

  // ==========================================================
  // CANCELAMENTO
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
  // MODO MESTRE
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

// ============================================================
// INTERFACE DO MESTRE
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
        const rows =
          skills
            .map((skill) => {
              const pendingRequest =
                pending.find(
                  (request) =>
                    request.targetPlayerId ===
                      player.id &&
                    request.skillName ===
                      skill
                );

              return `
                <div class="gm-skill-row">

                  <span>
                    ${escapeHtml(
                      skill
                    )}
                  </span>

                  <div>

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
                            data-skill="${escapeHtml(skill)}"
                          >
                            PEDIR
                          </button>
                        `
                    }

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

            ${rows}

          </div>
        `;
      })
      .join("");

  document.querySelector<HTMLDivElement>(
    "#app"
  )!.innerHTML = `
    <div class="app">

      <h1>
        RPG Calúnia
      </h1>

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
        <strong>
          Mestre
        </strong>
      </p>

      <hr />

      <h2>
        Jogadores
      </h2>

      ${
        players.length
          ? playerCards
          : `
            <p>
              Nenhum jogador conectado.
            </p>
          `
      }

      <hr />

      <h2>
        Último resultado
      </h2>

      <div id="result-card"></div>

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
              createId("request"),

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

            const status =
              document.querySelector<HTMLParagraphElement>(
                "#status"
              );

            if (status) {
              status.textContent =
                "Erro ao enviar o teste.";
            }
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
        async () => {
          const requestId =
            button.dataset.requestId!;

          const request =
            getPendingRequests()
              .find(
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

            const status =
              document.querySelector<HTMLParagraphElement>(
                "#status"
              );

            if (status) {
              status.textContent =
                `Teste de ${request.skillName} cancelado para ${request.targetPlayerName}.`;
            }

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
            createId("roll");

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

            status.textContent =
              "Erro ao rolar.";
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
  const buttons =
    skills
      .map(
        (skill) =>
          `<button
            class="skill-button"
            data-skill="${escapeHtml(
              skill
            )}"
          >
            ${escapeHtml(
              skill
            )}
          </button>`
      )
      .join("");

  document.querySelector<HTMLDivElement>(
    "#app"
  )!.innerHTML = `
    <div class="app">

      <h1>
        RPG Calúnia
      </h1>

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
        <strong>
          Jogador
        </strong>
      </p>

      ${
        pendingRequest
          ? `
            <div class="pending-test">

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

      ${buttons}

      <div id="result-card"></div>

      <p id="status"></p>

    </div>
  `;

  // ==========================================================
  // TESTE SOLICITADO
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
          createId("roll");

        pendingRolls.set(
          rollId,
          pendingRequest.skillName
        );

        pendingRollRequestIds.set(
          rollId,
          pendingRequest.requestId
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
            "Erro ao realizar teste:",
            error
          );

          pendingRolls.delete(
            rollId
          );

          pendingRollRequestIds.delete(
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
            createId("roll");

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
          } catch (error) {
            console.error(
              "Erro ao enviar rolagem:",
              error
            );

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

OBR.onReady(start);