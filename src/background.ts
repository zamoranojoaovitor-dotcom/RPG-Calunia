import OBR from "@owlbear-rodeo/sdk";

const REQUEST_CHANNEL = "rpg-calunia/test-request";
const LOCAL_REQUEST_CHANNEL = "rpg-calunia/show-test-request";
const METADATA_KEY = "rpg-calunia/pending-test";

type TestRequest = {
  targetPlayerId: string;
  targetPlayerName: string;
  skillName: string;
  bonus: number;
  requesterName: string;
  timestamp: number;
};

async function start() {
  const playerId = await OBR.player.getId();
  const playerRole = await OBR.player.getRole();

  console.log("RPG Calúnia Background iniciado.");
  console.log("Meu playerId:", playerId);
  console.log("Minha função:", playerRole);

  OBR.broadcast.onMessage(
    REQUEST_CHANNEL,
    async (event) => {
      const request = event.data as TestRequest;

      console.log(
        "Pedido recebido pelo background:",
        request
      );

      // Este pedido é para outro jogador.
      if (request.targetPlayerId !== playerId) {
        return;
      }

      console.log(
        `TESTE SOLICITADO: ${request.skillName} +${request.bonus}`
      );

      // Guarda o pedido no metadata do próprio jogador.
      await OBR.player.setMetadata({
        [METADATA_KEY]: request,
      });

      // Mostra um aviso no ícone da extensão.
      await OBR.action.setBadgeText("!");

      // Se o popover estiver aberto, entrega imediatamente o pedido
      // para a interface do jogador.
      await OBR.broadcast.sendMessage(
        LOCAL_REQUEST_CHANNEL,
        request,
        {
          destination: "LOCAL",
        }
      );
    }
  );
}

OBR.onReady(start);