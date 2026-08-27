import OBR from "@owlbear-rodeo/sdk";

const REQUEST_CHANNEL =
  "rpg-calunia/test-request";

const CANCEL_CHANNEL =
  "rpg-calunia/test-cancel";

const LOCAL_REQUEST_CHANNEL =
  "rpg-calunia/show-test-request";

const LOCAL_CANCEL_CHANNEL =
  "rpg-calunia/show-test-cancel";

const METADATA_KEY =
  "rpg-calunia/pending-test";

type TestRequest = {
  requestId: string;
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  requesterName: string;
  timestamp: number;
};

async function showBadge() {
  try {
    await OBR.action.setBadgeBackgroundColor(
      "#ff4fa3"
    );

    await OBR.action.setBadgeText("!");
  } catch (error) {
    console.error(
      "Erro ao mostrar badge:",
      error
    );
  }
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

async function start() {
  const playerId =
    await OBR.player.getId();

  const playerRole =
    await OBR.player.getRole();

  console.log(
    "RPG Calúnia Background iniciado."
  );

  console.log(
    "Meu playerId:",
    playerId
  );

  console.log(
    "Minha função:",
    playerRole
  );

  // ============================================================
  // RECEBER PEDIDOS
  // ============================================================

  OBR.broadcast.onMessage(
    REQUEST_CHANNEL,
    async (event) => {
      const request =
        event.data as TestRequest;

      console.log(
        "Pedido recebido pelo background:",
        request
      );

      if (
        request.targetPlayerId !==
        playerId
      ) {
        return;
      }

      console.log(
        `TESTE SOLICITADO: ${request.skillName}`
      );

      await OBR.player.setMetadata({
        [METADATA_KEY]:
          request,
      });

      await showBadge();

      await OBR.broadcast.sendMessage(
        LOCAL_REQUEST_CHANNEL,
        request,
        {
          destination:
            "LOCAL",
        }
      );
    }
  );

  // ============================================================
  // RECEBER CANCELAMENTO
  // ============================================================

  OBR.broadcast.onMessage(
    CANCEL_CHANNEL,
    async (event) => {
      const request =
        event.data as TestRequest;

      console.log(
        "Cancelamento recebido:",
        request
      );

      if (
        request.targetPlayerId !==
        playerId
      ) {
        return;
      }

      const metadata =
        await OBR.player.getMetadata();

      const currentRequest =
        metadata[
          METADATA_KEY
        ] as
          | TestRequest
          | undefined;

      // Só apagamos se for o mesmo pedido.
      if (
        currentRequest?.requestId ===
        request.requestId
      ) {
        await OBR.player.setMetadata({
          [METADATA_KEY]:
            undefined,
        });

        await clearBadge();

        await OBR.broadcast.sendMessage(
          LOCAL_CANCEL_CHANNEL,
          request,
          {
            destination:
              "LOCAL",
          }
        );
      }
    }
  );

  // ============================================================
  // OBSERVAR METADATA
  // ============================================================

  OBR.player.onChange(
    async (player) => {
      const pendingRequest =
        player.metadata[
          METADATA_KEY
        ] as
          | TestRequest
          | undefined;

      if (!pendingRequest) {
        await clearBadge();
      }
    }
  );
}

OBR.onReady(start);