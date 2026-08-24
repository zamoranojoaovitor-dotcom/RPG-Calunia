import OBR from "@owlbear-rodeo/sdk";

const REQUEST_CHANNEL = "rpg-calunia/test-request";

const LOCAL_REQUEST_CHANNEL =
  "rpg-calunia/show-test-request";

const METADATA_KEY =
  "rpg-calunia/pending-test";

type TestRequest = {
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  bonus: number;
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
    await OBR.action.setBadgeText(undefined);
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

  // Não definimos mais o ícone por código.
  // O manifest.json será responsável pelo ícone inicial.

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
        `TESTE SOLICITADO: ${request.skillName} +${request.bonus}`
      );

      await OBR.player.setMetadata({
        [METADATA_KEY]: request,
      });

      await showBadge();

      await OBR.broadcast.sendMessage(
        LOCAL_REQUEST_CHANNEL,
        request,
        {
          destination: "LOCAL",
        }
      );
    }
  );

  OBR.player.onChange(
    async (player) => {
      const pendingRequest =
        player.metadata[
          METADATA_KEY
        ] as TestRequest | undefined;

      if (!pendingRequest) {
        await clearBadge();
      }
    }
  );
}

OBR.onReady(start);